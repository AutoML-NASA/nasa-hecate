# optimal_path_finder_astar_with_progress_directional.py
# SLDEM2015 DEM (IMG/LBL) -> slope/velocity -> A* optimal path (time-optimal)
# Keeps: progress logs + status JSON + CSV/GeoJSON/PNG outputs
# MODIFIED: Replaced g_score dictionary with a NumPy array for performance.

import math, heapq, json, csv, time
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import Affine

# ==================== USER INPUT (No changes needed) ====================
LBL_PATH = "/home/haesungkim/nasa-hecate/map/SLDEM2015_512_00N_30N_000_045_FLOAT.LBL"

# A) Specify lon/lat (deg) or B) pixel row/col
# (Set START_ROW_COL/GOAL_ROW_COL to None to use lon/lat)
# 픽셀 모드 사용
START_LON_LAT = None
GOAL_LON_LAT  = None

# 추천 1: 단거리 장애물 통과
START_ROW_COL = (10000, 10000)
GOAL_ROW_COL  = (12000, 6000)


# Slope -> speed model
V0 = 1.0          # 평지에서의 최고 속도 (m/s). 모든 속도 계산의 기준이 됩니다.
K  = 0.2         # 경사 저항 계수. 값이 클수록 경사에 따라 속도가 더 빠르게 감소합니다.
V_FLOOR = 0.10    # 최저 보장 속도 (m/s). 로버의 속도가 이 값 밑으로 떨어지지 않도록 보장합니다.
SLOPE_BLOCK_DEG = 35.0  # 통행 불가능 경사 (도). 설정된 각도보다 가파른 지형은 이동 불가능한 벽으로 간주됩니다.

# Directional speed (uphill/downhill) toggle & params
DIRECTIONAL_SPEED = True
UPHILL_K_GRADE = 2.5        # 오르막 주행 페널티 계수. 오르막을 오를 때 추가로 속도를 감소시키는 정도를 결정합니다.
DOWNHILL_GAIN_SLOPE = 0.2   # 내리막 주행 보너스 계수. 내리막을 내려갈 때 추가로 속도를 높이는 정도를 결정합니다.
DOWNHILL_GAIN_MAX = 0.10    # 내리막 최대 보너스 한계. 내리막에서 얻을 수 있는 최대 속도 증가율(%)을 제한합니다.

# Outputs
OUT_PREFIX = "sldem_astar_path_optimized" # Changed prefix to reflect optimization
SAVE_PNG = True

# Progress logging
VERBOSE = True
LOG_EVERY_ITERS = 50_000
LOG_EVERY_SECS  = 5.0
STATUS_JSON = f"{OUT_PREFIX}.status.json"
# ====================================================


# ---------- status file (No changes needed) ----------
def write_status(stage: str, **kwargs):
    try:
        payload = {"stage": stage, "time_s": round(time.time(), 3), **kwargs}
        Path(STATUS_JSON).write_text(json.dumps(payload, indent=2))
    except Exception:
        pass


# ---------- Simple Cylindrical Moon utils (No changes needed) ----------
MOON_R_M = 1737400.0

def pix_to_xy(transform: Affine, row: int, col: int):
    x, y = transform * (col + 0.5, row + 0.5)
    return x, y

def xy_to_lonlat(x, y, lon0_deg=180.0):
    lon = (x / MOON_R_M) * (180.0 / math.pi) + lon0_deg
    lat = (y / MOON_R_M) * (180.0 / math.pi)
    if lon < 0: lon += 360.0
    if lon >= 360.0: lon -= 360.0
    return lon, lat

def lonlat_to_xy(lon_deg, lat_deg, lon0_deg=180.0):
    x = ((lon_deg - lon0_deg) * math.pi / 180.0) * MOON_R_M
    y = ( lat_deg            * math.pi / 180.0) * MOON_R_M
    return x, y

def xy_to_rowcol(transform: Affine, x, y, height, width):
    inv = ~transform
    col_f, row_f = inv * (x, y)
    r = min(max(int(math.floor(row_f)), 0), height-1)
    c = min(max(int(math.floor(col_f)), 0), width-1)
    return r, c


# ---------- Load DEM & Pre-computation (No changes needed) ----------
print("[INFO] Reading DEM via LBL...")
t_read0 = time.time()
with rasterio.open(LBL_PATH) as src:
    raw = src.read(1).astype(np.float64)
    nodata = src.nodata
    transform = src.transform
    H, W = src.height, src.width
    pixel_m = abs(transform.a)  # ~59.225 m/px

if nodata is not None:
    raw[raw == nodata] = np.nan

height_m = raw * 1000.0
nan_mask = ~np.isfinite(height_m)
height_m[nan_mask] = np.nan

print(f"[INFO] DEM shape: {H} x {W}, pixel ~{pixel_m:.3f} m")
write_status("read_dem_done", H=H, W=W, pixel_m=round(pixel_m,3),
             elapsed_s=round(time.time()-t_read0,1))

print("[INFO] Computing slope...")
t_slope0 = time.time()
gy, gx = np.gradient(height_m, pixel_m, pixel_m)
slope_rad = np.arctan(np.hypot(gx, gy))
slope_deg = np.degrees(slope_rad)
slope_deg[nan_mask] = np.nan
write_status("slope_done", elapsed_s=round(time.time()-t_slope0,1))

t_vel0 = time.time()
vel = V0 * np.exp(-K * np.nan_to_num(slope_deg, nan=90.0))
vel = np.clip(vel, V_FLOOR, None)
blocked = (nan_mask | (slope_deg >= SLOPE_BLOCK_DEG))
vel[blocked] = 0.0
write_status("velocity_done", elapsed_s=round(time.time()-t_vel0,1))

if START_ROW_COL and GOAL_ROW_COL:
    sr, sc = START_ROW_COL
    gr, gc = GOAL_ROW_COL
else:
    sx, sy = lonlat_to_xy(*START_LON_LAT)
    gx_, gy_ = lonlat_to_xy(*GOAL_LON_LAT)
    with rasterio.open(LBL_PATH) as src:
        sr, sc = xy_to_rowcol(src.transform, sx, sy, H, W)
        gr, gc = xy_to_rowcol(src.transform, gx_, gy_, H, W)

print(f"[INFO] start (r,c)=({sr},{sc}), goal (r,c)=({gr},{gc})")
if vel[sr, sc] <= 0 or vel[gr, gc] <= 0:
    print("[WARN] Start or goal on blocked/NoData cell. Adjust inputs.")
write_status("start_goal", start_row=sr, start_col=sc, goal_row=gr, goal_col=gc)


# ==================== A* ALGORITHM START ====================
# This section replaces the D* Lite implementation.
INF = float('inf')

start = (sr, sc)
goal  = (gr, gc)

def heuristic(a, b):
    """ Heuristic: estimated time from a to b (goal). Uses max possible speed. """
    dr = a[0]-b[0]; dc = a[1]-b[1]
    dist_m = pixel_m * math.hypot(dr, dc)
    return dist_m / V0 # Use V0 for an admissible heuristic (never overestimates)

# Neighbors: dr, dc, distance_multiplier
NEI = [(-1,0), (1,0), (0,-1), (0,1),
       (-1,-1), (-1,1), (1,-1), (1,1)]

def in_bounds(r,c): return 0 <= r < H and 0 <= c < W

def edge_time(u, v):
    """ Travel time from u to v. This is our edge cost function, c(u,v). """
    ur, uc = u; vr, vc = v
    if vel[vr, vc] <= 0: # Cannot enter a blocked cell
        return INF
    
    dm = pixel_m * (math.sqrt(2) if (ur!=vr and uc!=vc) else 1.0)
    
    # Use average velocity of the two cells as base speed
    v_mean = 0.5 * (float(vel[ur,uc]) + float(vel[vr,vc]))

    if not DIRECTIONAL_SPEED:
        v_final = v_mean
    else:
        dz = float(height_m[vr,vc] - height_m[ur,uc]) # Elevation change
        grade = dz / dm                               # rise/run
        
        v_final = v_mean
        if grade > 0:  # Uphill
            v_final *= math.exp(-UPHILL_K_GRADE * grade)
        elif grade < 0: # Downhill
            v_final *= (1.0 + min(DOWNHILL_GAIN_MAX, DOWNHILL_GAIN_SLOPE * abs(grade)))
            
    v_final = max(v_final, V_FLOOR)
    return dm / v_final


def find_path_astar():
    open_set = [] # Priority queue: (f_score, node)
    heapq.heappush(open_set, (heuristic(start, goal), start))
    
    came_from = {} # To reconstruct path
    
    # MODIFICATION: Use a NumPy array for g_score instead of a dictionary for performance.
    g_score = np.full((H, W), np.inf, dtype=np.float64)
    g_score[start] = 0.0
    
    iters = 0
    t0 = time.time()
    last_log = t0

    write_status("astar_start")

    while open_set:
        iters += 1
        
        current_f, current = heapq.heappop(open_set)

        if current == goal:
            print(f"[A*] Goal reached after {iters:,} iterations.")
            write_status("astar_done", total_iters=iters, elapsed_s=round(time.time()-t0,1))
            return came_from, g_score[goal]

        # MODIFICATION: Stale entry check now uses the g_score NumPy array.
        if current_f > g_score[current] + heuristic(current, goal):
             continue

        ur, uc = current
        for dr, dc in NEI:
            neighbor = (ur + dr, uc + dc)
            if not in_bounds(neighbor[0], neighbor[1]):
                continue

            cost = edge_time(current, neighbor)
            if cost == INF:
                continue

            # MODIFICATION: Access g_score using NumPy indexing.
            tentative_g_score = g_score[current] + cost
            
            # MODIFICATION: Access g_score using NumPy indexing.
            if tentative_g_score < g_score[neighbor]:
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g_score
                f_score = tentative_g_score + heuristic(neighbor, goal)
                heapq.heappush(open_set, (f_score, neighbor))

        if VERBOSE:
            now = time.time()
            need_log = (iters % LOG_EVERY_ITERS == 0) or (now - last_log >= LOG_EVERY_SECS)
            if need_log:
                elapsed = now - t0
                best_f = open_set[0][0] if open_set else float('inf')
                print(f"[A*] iters={iters:,} open={len(open_set):,} "
                      f"best_f={best_f if best_f < INF else 'inf':.1f} "
                      f"elapsed={elapsed:.1f}s")
                write_status("astar_running",
                             iters=iters, open=len(open_set), closed=len(came_from),
                             best_f_score=(None if best_f==INF else round(best_f,1)),
                             elapsed_s=round(elapsed,1))
                last_log = now

    write_status("astar_failed")
    return None, INF

# ===================== A* ALGORITHM END =====================


print("[INFO] Running A* ...")
came_from, total_time = find_path_astar()


# ---------- Reconstruct path (A* version) - No changes needed ----------
if came_from is None:
    raise RuntimeError("No path found (start not connected to goal).")

path = []
cur = goal
t_rec0 = time.time()
# Path reconstruction requires a check for the start node itself,
# as it won't be in the `came_from` dictionary.
while cur != start:
    path.append(cur)
    if cur not in came_from:
        # This can happen if the goal is unreachable but the loop terminated somehow.
        # Or if start and goal are the same.
        print(f"[WARN] Path reconstruction ended prematurely at {cur}.")
        path = [] # Indicate failure
        break
    cur = came_from[cur]
if path: # Only add start if a path was found
    path.append(start)
    path.reverse()

if not path:
     raise RuntimeError("Path reconstruction failed.")


write_status("reconstruct_done", steps=len(path), elapsed_s=round(time.time()-t_rec0,1))
print(f"[INFO] Path length (pixels): {len(path)}")


# ---------- Per-step stats & save (No changes needed) ----------
def step_dist_m(a,b):
    return pixel_m * (math.sqrt(2) if (a[0]!=b[0] and a[1]!=b[1]) else 1.0)

with rasterio.open(LBL_PATH) as src:
    transform = src.transform

cum_t = 0.0
cum_d = 0.0
rows = []
for i, rc in enumerate(path):
    r,c = rc
    x,y = pix_to_xy(transform, r, c)
    lon, lat = xy_to_lonlat(x,y)
    elev = float(height_m[r,c]) if np.isfinite(height_m[r,c]) else float('nan')
    slope = float(slope_deg[r,c]) if np.isfinite(slope_deg[r,c]) else float('nan')
    seg_d = 0.0
    seg_t = 0.0
    if i>0:
        prev = path[i-1]
        seg_d = step_dist_m(prev, rc)
        t_edge = edge_time(prev, rc)
        seg_t = float('nan') if t_edge==INF else t_edge
        cum_d += seg_d
        if np.isfinite(seg_t): cum_t += seg_t
    rows.append([i, r, c, lon, lat, elev, slope, seg_d, cum_d, seg_t, cum_t])

# ---------- Save CSV ----------
csv_path = f"{OUT_PREFIX}.csv"
with open(csv_path, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["idx","row","col","lon_deg","lat_deg","elev_m","slope_deg",
                "seg_dist_m","cum_dist_m","seg_time_s","cum_time_s"])
    w.writerows(rows)
print(f"[OUT] CSV   -> {csv_path}")

# ---------- Save GeoJSON ----------
geojson = {
  "type":"FeatureCollection",
  "features":[
    {"type":"Feature",
     "properties":{"name":"AStar path"},
     "geometry":{
       "type":"LineString",
       "coordinates":[ [rows[i][3], rows[i][4]] for i in range(len(rows)) ]
     }}
  ]
}
geojson_path = f"{OUT_PREFIX}.geojson"
Path(geojson_path).write_text(json.dumps(geojson, indent=2))
print(f"[OUT] GeoJSON -> {geojson_path}")

# ---------- Optional: PNG overlay ----------
if SAVE_PNG:
    try:
        from PIL import Image, ImageDraw
        z = np.nan_to_num(height_m, nan=np.nanmin(height_m))
        zmin, zmax = float(np.nanmin(z)), float(np.nanmax(z))
        z8 = ((z - zmin)/(zmax-zmin+1e-12)*255).astype(np.uint8)
        img = Image.fromarray(z8, mode="L")
        img_rgb = img.convert("RGB")
        drw = ImageDraw.Draw(img_rgb)
        pts = [ (p[1], p[0]) for p in path ] # (x=col, y=row)
        drw.line(pts, fill=(255,0,0), width=30) # Made line thicker
        png_path = f"{OUT_PREFIX}.png"
        img_rgb.save(png_path)
        print(f"[OUT] PNG   -> {png_path}")
    except Exception as e:
        print("[WARN] PNG overlay failed:", e)

write_status("outputs_done", csv=csv_path, geojson=geojson_path,
             png=(png_path if SAVE_PNG else None))
print(f"[INFO] Total time (s): {cum_t:.1f}, distance (m): {cum_d:.1f}")
print(f"[INFO] A* found total time (s): {total_time:.1f}")