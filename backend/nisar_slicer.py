"""Virtual HDF5 bounding-box slicer for NISAR L2 GCOV granules.

Opens /science/LSAR/GCOV/grids/frequencyA/ via earthaccess (fsspec file-like
over HTTPS/S3 byte ranges) + h5py, slices ONLY the requested bounding box in
memory, and computes backscatter statistics. A 30 GB granule is never
downloaded in full.

Honesty notes (per project disclosure rules):
- Change in dB requires two co-registered, compatible GCOV observations:
  delta_db = 10*log10(after) - 10*log10(before), positive power values only.
- earthaccess alone does not make every HDF5 asset efficiently streamable;
  when credentials, network, or a suitable transport are missing this module
  raises SlicerOffline and the caller falls back to seeded simulated data.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass

GCOV_GRID = "/science/LSAR/GCOV/grids/frequencyA"


class SlicerOffline(Exception):
    """Raised when live NASA Earthdata access is unavailable; callers must
    fall back to seeded (data_mode='simulated') anomalies without crashing."""


@dataclass
class BboxSlice:
    granule_url: str
    bbox: tuple[float, float, float, float]  # (min_lon, min_lat, max_lon, max_lat)
    polarization: str
    mean_power: float
    valid_pixels: int

    @property
    def mean_db(self) -> float:
        if self.mean_power <= 0:
            return float("nan")
        return 10.0 * math.log10(self.mean_power)


def compute_delta_db(before_power: float, after_power: float) -> float:
    """delta dB between two co-registered mean backscatter powers (linear)."""
    if before_power <= 0 or after_power <= 0:
        raise ValueError("backscatter power must be positive to convert to dB")
    return 10.0 * math.log10(after_power) - 10.0 * math.log10(before_power)


def _open_remote_h5(url: str):
    """Open a remote NISAR granule as an h5py File via earthaccess/fsspec."""
    try:
        import earthaccess
        import h5py
    except ImportError as exc:  # pragma: no cover
        raise SlicerOffline(f"streaming deps unavailable: {exc}") from exc

    token = os.environ.get("EARTHDATA_TOKEN", "")
    try:
        if token:
            auth = earthaccess.login(strategy="environment")
        else:
            auth = earthaccess.login(strategy="netrc")
        if not getattr(auth, "authenticated", False):
            raise SlicerOffline("Earthdata credentials unavailable")
        fileobj = earthaccess.open([url])[0]
        return h5py.File(fileobj, "r")
    except SlicerOffline:
        raise
    except Exception as exc:
        raise SlicerOffline(f"cannot stream granule: {exc}") from exc


def slice_nisar_gcov_bbox(
    url: str,
    bbox: tuple[float, float, float, float],
    polarization: str = "HHHH",
) -> BboxSlice:
    """Slice one polarization layer of a GCOV granule to a WGS84 bbox.

    Reads only the coordinate vectors plus the bbox window of the data
    layer (h5py fancy slicing -> HTTP byte ranges), never the full raster.
    """
    import numpy as np

    min_lon, min_lat, max_lon, max_lat = bbox
    f = _open_remote_h5(url)
    try:
        grid = f[GCOV_GRID]
        x = grid["xCoordinates"][:]
        y = grid["yCoordinates"][:]
        # GCOV grids are commonly projected (UTM); when coordinates look like
        # degrees we compare directly, otherwise the caller must pass a bbox
        # in grid CRS. Keep the window selection explicit either way.
        xi = np.where((x >= min_lon) & (x <= max_lon))[0]
        yi = np.where((y >= min_lat) & (y <= max_lat))[0]
        if xi.size == 0 or yi.size == 0:
            raise SlicerOffline("bbox does not intersect granule grid")
        window = grid[polarization][yi.min() : yi.max() + 1, xi.min() : xi.max() + 1]
        window = np.asarray(window, dtype="float64")
        valid = window[np.isfinite(window) & (window > 0)]
        if valid.size == 0:
            raise SlicerOffline("no valid backscatter pixels in bbox")
        return BboxSlice(
            granule_url=url,
            bbox=bbox,
            polarization=polarization,
            mean_power=float(valid.mean()),
            valid_pixels=int(valid.size),
        )
    finally:
        f.close()


def polygonize_change_cells(
    lons, lats, mask
) -> list:
    """Union of grid cells flagged True in `mask` into shapely polygons.

    lons/lats are 1-D cell-center coordinate arrays; mask is 2-D [y, x].
    Returns a list of shapely Polygons (WGS84) for high-change clusters.
    """
    import numpy as np
    from shapely.geometry import box
    from shapely.ops import unary_union

    lons = np.asarray(lons)
    lats = np.asarray(lats)
    dx = float(np.median(np.diff(lons))) if lons.size > 1 else 0.001
    dy = float(np.median(np.diff(lats))) if lats.size > 1 else 0.001
    cells = [
        box(lons[j] - dx / 2, lats[i] - dy / 2, lons[j] + dx / 2, lats[i] + dy / 2)
        for i, j in zip(*np.nonzero(mask))
    ]
    if not cells:
        return []
    merged = unary_union(cells)
    if merged.geom_type == "Polygon":
        return [merged]
    return list(merged.geoms)
