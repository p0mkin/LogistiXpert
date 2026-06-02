extends Control

# UI References
@onready var player_name_lbl: Label = %PlayerName
@onready var legal_balance_lbl: Label = %LegalBalance
@onready var black_balance_lbl: Label = %BlackBalance
@onready var rep_val_lbl: Label = %RepVal
@onready var heat_val_lbl: Label = %HeatVal
@onready var city_name_lbl: Label = %CityName
@onready var schengen_val_lbl: Label = %SchengenVal
@onready var connection_list_box: VBoxContainer = %ConnectionList
@onready var console_lbl: Label = %ConsoleLabel
@onready var back_menu_btn: Button = %BackMenuBtn
@onready var garage_btn: Button = %GarageBtn
@onready var dispatch_btn: Button = %DispatchBtn
@onready var auction_btn: Button = %AuctionBtn
@onready var laundry_btn: Button = %LaundryBtn
@onready var underworld_btn: Button = %UnderworldBtn
@onready var shop_btn: Button = %ShopBtn
@onready var breakdown_btn: Button = %BreakdownBtn
@onready var leaderboard_btn: Button = %LeaderboardBtn
@onready var analytics_btn: Button = %AnalyticsBtn
@onready var research_btn: Button = %ResearchBtn
@onready var dealership_btn: Button = %DealershipBtn

# Camera Pan & Zoom controls
@onready var camera: Camera2D = $MapContainer/ViewportWrapper/Camera if has_node("MapContainer/ViewportWrapper/Camera") else %Camera
@onready var map_drawer: Node2D = $MapContainer/ViewportWrapper/VectorMapDrawer if has_node("MapContainer/ViewportWrapper/VectorMapDrawer") else %VectorMapDrawer
@onready var map_container: Control = $MapContainer if has_node("MapContainer") else %MapContainer
@onready var console_box: ColorRect = $HUD/SidePanel/Margin/VBox/ConsoleBox if has_node("HUD/SidePanel/Margin/VBox/ConsoleBox") else %ConsoleBox

var is_dragging: bool = false
var drag_start: Vector2 = Vector2.ZERO
var zoom_level: float = 1.0
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3.0

# Map rendering calculations
var cities_data: Dictionary = {}
var rendered_nodes: Dictionary = {} # city_id -> Vector2 (scaled screen coords)
var hovered_city_id: String = ""
var selected_city_id: String = ""

# Map Projection Scales
var map_min_lat: float = 48.0
var map_max_lat: float = 61.5
var map_min_lon: float = 9.5
var map_max_lon: float = 31.5
const MAP_MARGIN = 150 # screen offset bounds
var view_size = Vector2(850, 480)
var view_offset = Vector2(100, 100)

var time_passed: float = 0.0

# Geographic Border & Coastline Data
# Format: Array of points (Vector2(lat, lon))
var coastlines: Array = [
	[
		Vector2(59.45, 27.559),
		Vector2(59.48, 27.0),
		Vector2(59.55, 26.5),
		Vector2(59.6, 25.8),
		Vector2(59.52, 25.3),
		Vector2(59.46, 24.75),  # Tallinn near here
		Vector2(59.35, 24.1),
		Vector2(59.20, 23.4),  # Rohuküla area
		Vector2(58.38, 24.4),  # Pärnu
		Vector2(57.8, 24.3),   # Ainaži
		Vector2(57.2, 24.4),   # Saulkrasti
		Vector2(57.0, 24.1),   # Riga
		Vector2(57.0, 23.5),   # Jūrmala
		Vector2(57.75, 22.6),  # Cape Kolka
		Vector2(57.4, 21.5),   # Ventspils
		Vector2(56.5, 21.0122) # Down to Liepaja/west limit
	],
	[
		Vector2(59.0, 22.5),
		Vector2(58.85, 22.2),
		Vector2(58.75, 22.4),
		Vector2(58.85, 23.0),
		Vector2(59.0, 22.8),
		Vector2(59.0, 22.5) # Hiiumaa Island
	],
	[
		Vector2(58.55, 22.2),
		Vector2(58.4, 21.8),
		Vector2(57.9, 22.1),  # Sõrve Peninsula
		Vector2(58.3, 22.8),
		Vector2(58.6, 23.2),
		Vector2(58.5, 22.5),
		Vector2(58.55, 22.2) # Saaremaa Island
	],
	[
		Vector2(55.9, 21.08),  # Palanga area
		Vector2(55.7, 21.1),   # Klaipėda
		Vector2(55.3, 21.0122) # Curonian Spit limit
	],
	# --- FINLAND BALTIC COASTLINE ---
	[
		Vector2(60.18, 27.5),
		Vector2(60.20, 26.5),
		Vector2(60.17, 24.9384), # Helsinki
		Vector2(59.85, 23.2),
		Vector2(60.30, 22.1),     # Turku / Southwest limit
		Vector2(61.20, 21.3),
		Vector2(61.50, 21.5)      # Gulf of Bothnia (East coast)
	],
	# --- SWEDEN BALTIC COASTLINE ---
	[
		Vector2(61.50, 17.2),     # Northern Bothnia (West coast)
		Vector2(60.60, 17.5),
		Vector2(59.90, 18.8),
		Vector2(59.3293, 18.0686), # Stockholm
		Vector2(58.90, 17.9),
		Vector2(58.10, 16.5),
		Vector2(57.00, 16.5),
		Vector2(56.10, 15.0),     # Karlskrona
		Vector2(55.40, 13.0)      # Southern Sweden / Scania
	],
	# --- GERMANY BALTIC COASTLINE ---
	[
		Vector2(54.80, 9.9),       # Flensburg / Denmark limit
		Vector2(54.30, 10.15),     # Kiel
		Vector2(54.00, 10.9),      # Lübeck
		Vector2(54.18, 12.1),      # Rostock
		Vector2(54.40, 13.5),      # Rügen Island
		Vector2(53.95, 14.2)       # Poland border coast Usedom
	]
]

var borders: Array = [
	# --- SCHENGEN BORDERS (Schengen) ---
	{
		"is_schengen": true,
		"points": [
			Vector2(57.87, 24.35), # Estonia-Latvia Coast
			Vector2(57.9, 25.2),
			Vector2(57.64, 25.8),  # Valga/Valka
			Vector2(57.52, 26.6),
			Vector2(57.5, 27.4)    # Russia triple point
		]
	},
	{
		"is_schengen": true,
		"points": [
			Vector2(56.07, 21.1),  # Latvia-Lithuania Coast
			Vector2(56.3, 22.0),
			Vector2(56.38, 23.0),
			Vector2(56.2, 24.4),
			Vector2(56.0, 25.5),
			Vector2(55.75, 26.2),
			Vector2(55.68, 26.63)  # Belarus triple point
		]
	},
	{
		"is_schengen": true,
		"points": [
			Vector2(54.36, 22.79), # Lithuania-Poland-Kaliningrad triple point
			Vector2(54.15, 23.2),
			Vector2(53.95, 23.52)  # Lithuania-Poland-Belarus triple point
		]
	},
	{
		"is_schengen": true,
		"points": [
			Vector2(53.95, 14.22), # Germany-Poland border coast (Baltic)
			Vector2(53.20, 14.35),
			Vector2(52.50, 14.62), # Frankfurt an der Oder
			Vector2(51.50, 14.75),
			Vector2(50.85, 14.85)  # Czech triple point limit
		]
	},
	
	# --- EXTERNAL NON-SCHENGEN BORDERS (Orange warning) ---
	{
		"is_schengen": false,
		"points": [
			Vector2(53.95, 23.52), # Poland-Lithuania-Belarus triple point
			Vector2(53.6, 23.6),
			Vector2(53.2, 23.9),   # East of Bialystok
			Vector2(52.7, 23.6),
			Vector2(52.1, 23.5),   # West/South of Brest
			Vector2(52.0, 23.5)
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(53.95, 23.52), # Poland-Lithuania-Belarus triple point
			Vector2(54.2, 24.3),
			Vector2(54.5, 25.1),   # Close to Vilnius
			Vector2(54.8, 25.8),
			Vector2(55.2, 26.4),
			Vector2(55.68, 26.63)  # Belarus-Lithuania-Latvia triple point
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(55.68, 26.63), # Belarus-Lithuania-Latvia triple point
			Vector2(55.8, 27.2),
			Vector2(55.9, 27.559)  # East border
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(59.45, 27.559), # Russia-Estonia Narva river
			Vector2(59.0, 27.4),   # Lake Peipus
			Vector2(58.0, 27.5),
			Vector2(57.5, 27.4)    # Estonia-Latvia-Russia triple point
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(57.5, 27.4),   # Estonia-Latvia-Russia triple point
			Vector2(56.8, 27.7),
			Vector2(55.9, 27.559)  # East border
		]
	},
	# Kaliningrad Borders
	{
		"is_schengen": false,
		"points": [
			Vector2(55.2, 21.0122), # Kaliningrad-Lithuania coast
			Vector2(55.1, 21.8),
			Vector2(55.0, 22.5),
			Vector2(54.36, 22.79)  # Kaliningrad-Lithuania-Poland triple point
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(54.36, 22.79), # Kaliningrad-Lithuania-Poland triple point
			Vector2(54.38, 21.8),
			Vector2(54.4, 21.0122) # Kaliningrad-Poland coast (west boundary)
		]
	},
	# Ukraine external borders
	{
		"is_schengen": false,
		"points": [
			Vector2(51.50, 23.62), # Poland-Belarus-Ukraine triple point
			Vector2(50.80, 24.05),
			Vector2(50.15, 24.15),
			Vector2(49.45, 22.80),
			Vector2(49.00, 22.50)  # Poland-Slovakia-Ukraine triple point limit
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(51.50, 23.62), # Poland-Belarus-Ukraine triple point
			Vector2(51.52, 25.10),
			Vector2(51.65, 26.80),
			Vector2(51.50, 28.30),
			Vector2(51.35, 30.2219), # Belarus-Ukraine border near Chernobyl
			Vector2(51.80, 31.10),
			Vector2(52.12, 32.25)  # Belarus-Ukraine-Russia triple point
		]
	},
	# Finland external border (Russia)
	{
		"is_schengen": false,
		"points": [
			Vector2(60.18, 27.50), # Gulf of Finland coast
			Vector2(60.60, 28.20),
			Vector2(61.10, 28.85),
			Vector2(61.50, 29.50)  # Northern map limit
		]
	}
]

func _ready() -> void:
	# Set up visual telemetry theme overrides
	_apply_hud_theme()
	
	# Load and project the Baltic route network
	_load_map_data()
	
	# Sync initial GameState telemetry values
	_sync_hud_data()
	
	# Signal listeners
	GameState.balance_updated.connect(_on_balances_updated)
	GameState.reputation_updated.connect(_on_reputation_updated)
	NetworkManager.connection_status_changed.connect(_on_network_status_changed)
	
	# Network signals for active routes telemetry
	NetworkManager.route_progress_updated.connect(func(_data): map_drawer.queue_redraw())
	NetworkManager.route_completed.connect(func(_data): _fetch_active_routes())
	NetworkManager.driver_snitched.connect(func(_data): _fetch_active_routes())
	NetworkManager.engine_breakdown.connect(func(_data): _fetch_active_routes())
	NetworkManager.driver_wreck.connect(func(_data): _fetch_active_routes())
	
	# Fetch initial active routes list
	_fetch_active_routes()
	
	back_menu_btn.pressed.connect(_on_back_pressed)
	garage_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/garage/GarageManager.tscn"))
	dispatch_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/dispatch/DispatchCenter.tscn"))
	auction_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/auction/AuctionHouse.tscn"))
	laundry_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/laundry/LaundryFronts.tscn"))
	underworld_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/underworld/UnderworldDealer.tscn"))
	shop_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/shop/PartsShop.tscn"))
	breakdown_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/breakdown/BreakdownPanel.tscn"))
	leaderboard_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/leaderboard/Leaderboard.tscn"))
	analytics_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/analytics/LogisticsAnalytics.tscn"))
	research_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/research/TechTree.tscn"))
	dealership_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/dealership/Showroom.tscn"))
	
	# Instruct map drawer to implement our custom vector _draw call
	map_drawer.draw.connect(_draw_vector_map)
	
	# AAA Polish: Inject the Retro CRT Holo-Scanner Shader overlay over the map
	_inject_shader_overlay()
	
	set_process_input(true)

func _inject_shader_overlay() -> void:
	# Add a BackBufferCopy to grab the current screen texture behind the UI
	var back_buffer = BackBufferCopy.new()
	back_buffer.copy_mode = BackBufferCopy.COPY_MODE_VIEWPORT
	map_container.add_child(back_buffer)
	
	var overlay = ColorRect.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	var mat = ShaderMaterial.new()
	var shader = load("res://scenes/game_map/HoloScanner.gdshader")
	if shader:
		mat.shader = shader
		overlay.material = mat
	else:
		_log_console("Shader load failed", Color(1,0,0))
		
	map_container.add_child(overlay)

# ==========================================
# MAP PROJECTION ENGINE
# ==========================================
func _load_map_data() -> void:
	var file = FileAccess.open("res://resources/cities.json", FileAccess.READ)
	if not file:
		_log_console("System Error: resources/cities.json not found.", Color(0.901, 0.298, 0.235))
		return
		
	var json_str = file.get_as_text()
	var json = JSON.parse_string(json_str)
	if not json or not json.has("cities"):
		_log_console("System Error: Corrupt route network dataset.", Color(0.901, 0.298, 0.235))
		return
		
	cities_data = json.cities
	
	# Project coordinates correctly using the aspect-ratio-preserving formula
	for city_id in cities_data:
		var city = cities_data[city_id]
		var lat = float(city.coords.x)
		var lon = float(city.coords.y)
		rendered_nodes[city_id] = _coords_to_pos(Vector2(lat, lon))
		
	# Center the camera inside projected bounds
	var mid_pos = Vector2(
		view_offset.x + view_size.x * 0.5,
		view_offset.y + view_size.y * 0.5
	)
	camera.position = mid_pos
	
	_log_console("Route network loaded: %d cities, projected correctly on vector dashboard." % cities_data.size(), Color(0.18, 0.8, 0.44))
	map_drawer.queue_redraw()

# ==========================================
# ANIMATIONS AND PROJECTIONS
# ==========================================
func _process(delta: float) -> void:
	time_passed += delta
	if map_drawer:
		map_drawer.queue_redraw()

func _pos_to_coords(pos: Vector2) -> Vector2:
	var avg_lat = (map_min_lat + map_max_lat) * 0.5
	var cos_lat = cos(avg_lat * PI / 180.0)
	
	var min_lat = map_min_lat
	var max_lat = map_max_lat
	var min_lon = map_min_lon
	var max_lon = map_max_lon
	
	var geo_width = (max_lon - min_lon) * cos_lat
	var geo_height = (max_lat - min_lat)
	
	var padding = 60.0
	var available_w = view_size.x - padding * 2.0
	var available_h = view_size.y - padding * 2.0
	
	var scale_x = available_w / geo_width
	var scale_y = available_h / geo_height
	var map_scale = min(scale_x, scale_y)
	
	var center_lat = (min_lat + max_lat) * 0.5
	var center_lon = (min_lon + max_lon) * 0.5
	
	var screen_center = view_offset + view_size * 0.5
	
	var dx = (pos.x - screen_center.x) / map_scale
	var dy = (screen_center.y - pos.y) / map_scale
	
	var lat = center_lat + dy
	var lon = center_lon + dx / cos_lat
	
	return Vector2(lat, lon)

func _coords_to_pos(coords: Vector2) -> Vector2:
	var lat = coords.x
	var lon = coords.y
	
	var avg_lat = (map_min_lat + map_max_lat) * 0.5
	var cos_lat = cos(avg_lat * PI / 180.0)
	
	var min_lat = map_min_lat
	var max_lat = map_max_lat
	var min_lon = map_min_lon
	var max_lon = map_max_lon
	
	var geo_width = (max_lon - min_lon) * cos_lat
	var geo_height = (max_lat - min_lat)
	
	var padding = 60.0
	var available_w = view_size.x - padding * 2.0
	var available_h = view_size.y - padding * 2.0
	
	var scale_x = available_w / geo_width
	var scale_y = available_h / geo_height
	var map_scale = min(scale_x, scale_y)
	
	var center_lat = (min_lat + max_lat) * 0.5
	var center_lon = (min_lon + max_lon) * 0.5
	
	var screen_center = view_offset + view_size * 0.5
	
	var dy = lat - center_lat
	var dx = (lon - center_lon) * cos_lat
	
	return Vector2(
		screen_center.x + dx * map_scale,
		screen_center.y - dy * map_scale
	)

func _get_active_route_for_connection(from_id: String, to_id: String) -> Dictionary:
	for truck_id in GameState.active_routes:
		var route = GameState.active_routes[truck_id]
		var origin = ""
		var dest = ""
		if route.get("legalContract") != null:
			origin = route.get("legalContract").get("origin", "").to_lower()
			dest = route.get("legalContract").get("destination", "").to_lower()
		elif route.get("contrabandJob") != null:
			origin = route.get("contrabandJob").get("origin", "").to_lower()
			dest = route.get("contrabandJob").get("destination", "").to_lower()
		
		if (origin == from_id and dest == to_id) or (origin == to_id and dest == from_id):
			return route
	return {}

func _fetch_active_routes() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(
		func(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
			http.queue_free()
			if response_code == 200:
				var data = JSON.parse_string(body.get_string_from_utf8())
				if data and data is Array:
					GameState.active_routes.clear()
					for route in data:
						var truck_id = route.get("truckId", "")
						if truck_id != "":
							GameState.active_routes[truck_id] = route
					map_drawer.queue_redraw()
	)
	var url = NetworkManager.HTTP_URL + "/dispatch/active"
	http.request(
		url,
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _draw_dashed_line(from: Vector2, to: Vector2, color: Color, width: float, dash_len: float = 6.0, gap_len: float = 4.0, scroll_offset: float = 0.0) -> void:
	var dir = (to - from).normalized()
	var dist = from.distance_to(to)
	
	var cycle_len = dash_len + gap_len
	var offset = fmod(scroll_offset, cycle_len)
	if offset < 0.0:
		offset += cycle_len
		
	var current_dist = -offset
	while current_dist < dist:
		var start_pt = current_dist
		var end_pt = current_dist + dash_len
		
		start_pt = clamp(start_pt, 0.0, dist)
		end_pt = clamp(end_pt, 0.0, dist)
		
		if end_pt > start_pt:
			map_drawer.draw_line(from + dir * start_pt, from + dir * end_pt, color, width)
			
		current_dist += cycle_len

func _draw_dashed_polyline(points: Array, color: Color, width: float, dash_len: float = 6.0, gap_len: float = 4.0) -> void:
	if points.size() < 2:
		return
	for i in range(points.size() - 1):
		_draw_dashed_line(points[i], points[i + 1], color, width, dash_len, gap_len)

func _draw_polyline(points: Array, color: Color, width: float) -> void:
	if points.size() < 2:
		return
	for i in range(points.size() - 1):
		map_drawer.draw_line(points[i], points[i + 1], color, width)

# ==========================================
# 2D VECTOR RENDERING (DRAW OVERRIDES)
# ==========================================
func _draw_vector_map() -> void:
	var font = get_theme_font("font")
	var font_size = 10
	var text_color = Color(0.2, 0.45, 0.55, 0.4)
	
	# A. DRAW GEOGRAPHIC COASTLINES WITH TRIPLE WAVE RIPPLE (Concentric Parallel Coastlines)
	for ripple_idx in range(3):
		var alpha = 0.35
		var offset = Vector2.ZERO
		var ripple_width = 2.0
		if ripple_idx == 0:
			alpha = 0.35
			offset = Vector2.ZERO
			ripple_width = 2.0
		elif ripple_idx == 1:
			alpha = 0.15
			var ripple_t = time_passed * 2.5
			offset = Vector2(-4.0, -4.0) + Vector2(sin(ripple_t) * 1.0, cos(ripple_t) * 1.0)
			ripple_width = 1.0
		else:
			alpha = 0.05
			var ripple_t_else = time_passed * 1.8
			offset = Vector2(-8.0, -8.0) + Vector2(sin(ripple_t_else) * 1.5, cos(ripple_t_else) * 1.5)
			ripple_width = 1.0
			
		var ripple_color = Color(0.12, 0.45, 0.70, alpha)
		for coast in coastlines:
			var coast_projected_points = []
			for pt in coast:
				coast_projected_points.append(_coords_to_pos(pt) + offset)
			_draw_polyline(coast_projected_points, ripple_color, ripple_width)
		
	# B. DRAW STYLIZED COUNTRY BORDERS
	for border in borders:
		var border_projected_points = []
		for pt in border.points:
			border_projected_points.append(_coords_to_pos(pt))
			
		if border.is_schengen:
			# Subtle dashed grey-green Schengen border
			var schengen_border_color = Color(0.18, 0.80, 0.44, 0.18)
			_draw_dashed_polyline(border_projected_points, schengen_border_color, 1.5, 5.0, 4.0)
		else:
			# Highly visible glowing dashed orange-amber external border
			var external_border_color = Color(0.925, 0.607, 0.141, 0.65)
			var glow_color = Color(0.925, 0.607, 0.141, 0.12)
			_draw_dashed_polyline(border_projected_points, glow_color, 4.5, 5.0, 4.0)
			_draw_dashed_polyline(border_projected_points, external_border_color, 2.5, 5.0, 4.0)
	
	# 1. DRAW COORDINATE GRID LINES
	# Horizontal lines
	for h_y in range(int(view_offset.y), int(view_offset.y + view_size.y) + 1, 80):
		map_drawer.draw_line(Vector2(view_offset.x - 50, h_y), Vector2(view_offset.x + view_size.x + 50, h_y), Color(0.1, 0.3, 0.4, 0.12), 1.0)
		var h_coord = _pos_to_coords(Vector2(view_offset.x, h_y))
		var h_txt = "%.1f° N" % h_coord.x
		map_drawer.draw_string(font, Vector2(view_offset.x - 45, h_y + 4), h_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, text_color)
		
	# Vertical lines
	for v_x in range(int(view_offset.x), int(view_offset.x + view_size.x) + 1, 100):
		map_drawer.draw_line(Vector2(v_x, view_offset.y - 50), Vector2(v_x, view_offset.y + view_size.y + 50), Color(0.1, 0.3, 0.4, 0.12), 1.0)
		var v_coord = _pos_to_coords(Vector2(v_x, view_offset.y))
		var v_txt = "%.1f° E" % v_coord.y
		map_drawer.draw_string(font, Vector2(v_x - 20, view_offset.y - 10), v_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, text_color)
 
	# 2. DRAW VIEWPORT CORNER TICKS
	var corners = [
		view_offset,
		Vector2(view_offset.x + view_size.x, view_offset.y),
		view_offset + view_size,
		Vector2(view_offset.x, view_offset.y + view_size.y)
	]
	var tick_size = 15.0
	var tick_color = Color(0.2, 0.8, 1.0, 0.4)
	
	# Top-Left
	map_drawer.draw_line(corners[0], corners[0] + Vector2(tick_size, 0), tick_color, 2.0)
	map_drawer.draw_line(corners[0], corners[0] + Vector2(0, tick_size), tick_color, 2.0)
	# Top-Right
	map_drawer.draw_line(corners[1], corners[1] + Vector2(-tick_size, 0), tick_color, 2.0)
	map_drawer.draw_line(corners[1], corners[1] + Vector2(0, tick_size), tick_color, 2.0)
	# Bottom-Right
	map_drawer.draw_line(corners[2], corners[2] + Vector2(-tick_size, 0), tick_color, 2.0)
	map_drawer.draw_line(corners[2], corners[2] + Vector2(0, -tick_size), tick_color, 2.0)
	# Bottom-Left
	map_drawer.draw_line(corners[3], corners[3] + Vector2(tick_size, 0), tick_color, 2.0)
	map_drawer.draw_line(corners[3], corners[3] + Vector2(0, -tick_size), tick_color, 2.0)
 
	# 3. DRAW SCALE BAR
	var scale_pos = Vector2(view_offset.x, view_offset.y + view_size.y + 35)
	var scale_width = 150.0
	map_drawer.draw_line(scale_pos, scale_pos + Vector2(scale_width, 0), Color(0.2, 0.8, 1.0, 0.6), 2.0)
	map_drawer.draw_line(scale_pos, scale_pos + Vector2(0, -8), Color(0.2, 0.8, 1.0, 0.6), 2.0)
	map_drawer.draw_line(scale_pos + Vector2(scale_width, 0), scale_pos + Vector2(scale_width, -8), Color(0.2, 0.8, 1.0, 0.6), 2.0)
	map_drawer.draw_line(scale_pos + Vector2(scale_width / 2.0, 0), scale_pos + Vector2(scale_width / 2.0, -5), Color(0.2, 0.8, 1.0, 0.6), 1.5)
	map_drawer.draw_string(font, scale_pos + Vector2(10, -12), "TACTICAL SCALE: 100 KM", HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(0.2, 0.8, 1.0, 0.7))
 
	# 4. DRAW CONNECTION ROUTES (Flowing network pipelines)
	for city_id in cities_data:
		var city = cities_data[city_id]
		var start_pos = rendered_nodes[city_id]
		
		for conn_id in city.connections:
			if city_id < conn_id and rendered_nodes.has(conn_id):
				var end_pos = rendered_nodes[conn_id]
				var conn = city.connections[conn_id]
				
				# Get active route details for this connection
				var active_route = _get_active_route_for_connection(city_id, conn_id)
				var is_active = not active_route.is_empty()
				var is_selected_conn = (city_id == selected_city_id or conn_id == selected_city_id)
				
				if is_active:
					var is_smuggle = active_route.get("contrabandJobId") != null or active_route.get("isSmuggling", false)
					
					# 1. Translucent wider solid pipeline backing
					var backing_color = Color(0.607, 0.349, 0.713, 0.12) if is_smuggle else Color(0.180, 0.803, 0.443, 0.12)
					map_drawer.draw_line(start_pos, end_pos, backing_color, 8.0, true)
					
					# 2. Solid base line
					var base_line_color = Color(0.607, 0.349, 0.713, 0.4) if is_smuggle else Color(0.180, 0.803, 0.443, 0.4)
					map_drawer.draw_line(start_pos, end_pos, base_line_color, 1.5, true)
					
					# 3. Flowing dashed animation core (respects travel direction!)
					var origin = ""
					var dest = ""
					if active_route.get("legalContract") != null:
						origin = active_route.get("legalContract").get("origin", "").to_lower()
						dest = active_route.get("legalContract").get("destination", "").to_lower()
					elif active_route.get("contrabandJob") != null:
						origin = active_route.get("contrabandJob").get("origin", "").to_lower()
						dest = active_route.get("contrabandJob").get("destination", "").to_lower()
						
					var flow_from = start_pos
					var flow_to = end_pos
					if origin == conn_id and dest == city_id:
						flow_from = end_pos
						flow_to = start_pos
						
					var flow_color = Color(0.75, 0.45, 1.0, 0.95) if is_smuggle else Color(0.2, 0.95, 0.5, 0.95)
					_draw_dashed_line(flow_from, flow_to, flow_color, 2.0, 8.0, 6.0, time_passed * 42.0)
					
				else:
					var line_color = Color(0.12, 0.16, 0.20, 0.3)
					var route_width = 1.5
					if is_selected_conn:
						line_color = Color(0.65, 0.45, 1.0, 0.45)
						route_width = 2.0
					else:
						if conn.get("is_border_crossing", false):
							line_color = Color(0.5, 0.35, 0.15, 0.2)
						else:
							line_color = Color(0.15, 0.25, 0.2, 0.2)
					map_drawer.draw_line(start_pos, end_pos, line_color, route_width, true)
 
	# 5. DRAW ACTIVE TELEMETRY PULSES
	for pulse_city_id in cities_data:
		var pulse_city = cities_data[pulse_city_id]
		var pulse_start_pos = rendered_nodes[pulse_city_id]
		
		for pulse_conn_id in pulse_city.connections:
			if rendered_nodes.has(pulse_conn_id):
				var pulse_end_pos = rendered_nodes[pulse_conn_id]
				var pulse_conn = pulse_city.connections[pulse_conn_id]
				
				# Get active route details for this connection
				var pulse_active_route = _get_active_route_for_connection(pulse_city_id, pulse_conn_id)
				var pulse_is_active = not pulse_active_route.is_empty()
				
				if pulse_is_active:
					# Determine direction of travel
					var pulse_origin = ""
					var pulse_dest = ""
					if pulse_active_route.get("legalContract") != null:
						pulse_origin = pulse_active_route.get("legalContract").get("origin", "").to_lower()
						pulse_dest = pulse_active_route.get("legalContract").get("destination", "").to_lower()
					elif pulse_active_route.get("contrabandJob") != null:
						pulse_origin = pulse_active_route.get("contrabandJob").get("origin", "").to_lower()
						pulse_dest = pulse_active_route.get("contrabandJob").get("destination", "").to_lower()
					
					var pulse_start = pulse_start_pos
					var pulse_end = pulse_end_pos
					if pulse_origin == pulse_conn_id and pulse_dest == pulse_city_id:
						pulse_start = pulse_end_pos
						pulse_end = pulse_start_pos
					elif pulse_origin != pulse_city_id or pulse_dest != pulse_conn_id:
						continue
					
					var pct = float(pulse_active_route.get("progressPct", 0.0)) / 100.0
					var pulse_pos = pulse_start.lerp(pulse_end, pct)
					
					var pulse_is_smuggle = pulse_active_route.get("contrabandJobId") != null or pulse_active_route.get("isSmuggling", false)
					var pulse_color = Color(0.2, 0.9, 0.5, 0.8)
					if pulse_is_smuggle:
						pulse_color = Color(0.8, 0.4, 1.0, 0.9)
					elif pulse_conn.get("is_border_crossing", false):
						pulse_color = Color(1.0, 0.6, 0.1, 0.9)
						
					map_drawer.draw_circle(pulse_pos, 4.0, pulse_color)
					map_drawer.draw_arc(pulse_pos, 6.0 + sin(time_passed * 8.0) * 1.5, 0.0, TAU, 8, Color(pulse_color.r, pulse_color.g, pulse_color.b, 0.35), 1.5)
 
	# 6. DRAW ROTATING RADAR SWEEP
	var sweep_center = Vector2.ZERO
	var has_sweep = false
	if not selected_city_id.is_empty() and rendered_nodes.has(selected_city_id):
		sweep_center = rendered_nodes[selected_city_id]
		has_sweep = true
	elif not hovered_city_id.is_empty() and rendered_nodes.has(hovered_city_id):
		sweep_center = rendered_nodes[hovered_city_id]
		has_sweep = true
		
	if has_sweep:
		var radar_radius = 70.0
		var sweep_angle = time_passed * 1.8
		
		# Draw outer fading circle
		map_drawer.draw_arc(sweep_center, radar_radius, 0.0, TAU, 32, Color(0.65, 0.45, 1.0, 0.25), 1.0)
		
		# Draw sweeping arm
		var sweep_dir = Vector2(cos(sweep_angle), sin(sweep_angle))
		map_drawer.draw_line(sweep_center, sweep_center + sweep_dir * radar_radius, Color(0.65, 0.45, 1.0, 0.7), 1.5)
		
		# Draw rotating sweeps trail
		for i in range(5):
			var angle_offset = -float(i) * 0.12
			var sector_dir = Vector2(cos(sweep_angle + angle_offset), sin(sweep_angle + angle_offset))
			var alpha_trail = 0.45 * (1.0 - float(i) / 5.0)
			map_drawer.draw_line(sweep_center, sweep_center + sector_dir * radar_radius, Color(0.65, 0.45, 1.0, alpha_trail), 1.0)
 
	# 7. DRAW CITY NODES (On top of routes/grid)
	for node_city_id in cities_data:
		var node_city = cities_data[node_city_id]
		var pos = rendered_nodes[node_city_id]
		
		var radius = 8.0
		var outer_color = Color(0.180, 0.803, 0.443, 1.0)
		var inner_color = Color(0.04, 0.04, 0.06, 1.0)
		
		if not node_city.is_schengen:
			outer_color = Color(0.925, 0.607, 0.141, 1.0)
			
		# Subtle ambient glow pulsers for all nodes
		var pulse = sin(time_passed * 4.0 + hash(node_city_id)) * 1.5
		map_drawer.draw_circle(pos, radius + 4.0 + pulse, Color(outer_color.r, outer_color.g, outer_color.b, 0.15))
		
		# Thin elegant rotating cyber-rings for all nodes
		var r_ring_angle = time_passed * 0.8 + hash(node_city_id)
		var ring_color = Color(outer_color.r, outer_color.g, outer_color.b, 0.25)
		map_drawer.draw_arc(pos, radius + 5.0, r_ring_angle, r_ring_angle + PI * 0.3, 8, ring_color, 1.0)
		map_drawer.draw_arc(pos, radius + 5.0, r_ring_angle + PI, r_ring_angle + PI * 1.3, 8, ring_color, 1.0)
		
		if node_city_id == hovered_city_id:
			radius = 11.0
			outer_color = Color(0.2, 0.9, 0.7, 1.0)
			
			# Draw spinning HUD dashed outer octagon for hover
			var oct_rad = 18.0
			var rot_offset = time_passed * 1.5
			for i in range(8):
				var angle_start = rot_offset + (PI / 4.0) * i
				var angle_end = angle_start + (PI / 8.0)
				map_drawer.draw_arc(pos, oct_rad, angle_start, angle_end, 3, Color(0.2, 0.9, 0.7, 0.65), 1.0)
				
			# Draw corner HUD brackets around hover
			var b_sz = 5.0
			var b_offset = 15.0
			var b_color = Color(0.2, 0.9, 0.7, 0.8)
			# Top-left corner bracket
			map_drawer.draw_line(pos + Vector2(-b_offset, -b_offset), pos + Vector2(-b_offset + b_sz, -b_offset), b_color, 1.0)
			map_drawer.draw_line(pos + Vector2(-b_offset, -b_offset), pos + Vector2(-b_offset, -b_offset + b_sz), b_color, 1.0)
			# Top-right
			map_drawer.draw_line(pos + Vector2(b_offset, -b_offset), pos + Vector2(b_offset - b_sz, -b_offset), b_color, 1.0)
			map_drawer.draw_line(pos + Vector2(b_offset, -b_offset), pos + Vector2(b_offset, -b_offset + b_sz), b_color, 1.0)
			# Bottom-left
			map_drawer.draw_line(pos + Vector2(-b_offset, b_offset), pos + Vector2(-b_offset + b_sz, b_offset), b_color, 1.0)
			map_drawer.draw_line(pos + Vector2(-b_offset, b_offset), pos + Vector2(-b_offset, b_offset - b_sz), b_color, 1.0)
			# Bottom-right
			map_drawer.draw_line(pos + Vector2(b_offset, b_offset), pos + Vector2(b_offset - b_sz, b_offset), b_color, 1.0)
			map_drawer.draw_line(pos + Vector2(b_offset, b_offset), pos + Vector2(b_offset, b_offset - b_sz), b_color, 1.0)
			
		elif node_city_id == selected_city_id:
			radius = 10.0
			outer_color = Color(0.65, 0.45, 1.0, 1.0)
			
			# Selected crosshair targeting reticle lines
			var ret_color = Color(0.65, 0.45, 1.0, 0.5)
			map_drawer.draw_line(pos + Vector2(-22, 0), pos + Vector2(-12, 0), ret_color, 1.0)
			map_drawer.draw_line(pos + Vector2(12, 0), pos + Vector2(22, 0), ret_color, 1.0)
			map_drawer.draw_line(pos + Vector2(0, -22), pos + Vector2(0, -12), ret_color, 1.0)
			map_drawer.draw_line(pos + Vector2(0, 12), pos + Vector2(0, 22), ret_color, 1.0)
			
			# Rotating outer brackets
			var r_sel_angle = -time_passed * 2.0
			map_drawer.draw_arc(pos, 16.0, r_sel_angle, r_sel_angle + PI * 0.4, 12, Color(0.65, 0.45, 1.0, 0.8), 1.5)
			map_drawer.draw_arc(pos, 16.0, r_sel_angle + PI, r_sel_angle + PI * 1.4, 12, Color(0.65, 0.45, 1.0, 0.8), 1.5)
			
		# Draw layered vector circles
		map_drawer.draw_circle(pos, radius + 2.0, outer_color)
		map_drawer.draw_circle(pos, radius - 2.0, inner_color)
		
		# --- DIRECT MAP TEXT LABELING ---
		# Draw city names + code next to each coordinate node using clean tiny styling
		var node_label_font = get_theme_font("font")
		if node_label_font:
			var label_text = node_city.name.to_upper()
			var label_col = Color(0.709, 0.768, 0.843, 0.85)
			var label_bg_col = Color(0.04, 0.04, 0.06, 0.65)
			
			if node_city_id == selected_city_id:
				label_text += " [SEL]"
				label_col = Color(0.65, 0.45, 1.0, 1.0)
			elif node_city_id == hovered_city_id:
				label_text += " [HOV]"
				label_col = Color(0.2, 0.9, 0.7, 1.0)
			else:
				var zone_code = " // CZ" if not node_city.is_schengen else " // OK"
				label_text += zone_code
				label_col = Color(0.180, 0.803, 0.443, 0.65) if node_city.is_schengen else Color(0.925, 0.607, 0.141, 0.65)
			
			var text_pos = pos + Vector2(14, 4)
			map_drawer.draw_rect(Rect2(text_pos + Vector2(-2, -10), Vector2(100, 14)), label_bg_col, true)
			map_drawer.draw_string(node_label_font, text_pos, label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 8, label_col)
 
	# 8. CURSOR TELEMETRY HUD CROSSHAIRS AND COORDINATES
	var mouse_pos = map_drawer.get_local_mouse_position()
	var inside_viewport = mouse_pos.x >= view_offset.x and mouse_pos.x <= view_offset.x + view_size.x and mouse_pos.y >= view_offset.y and mouse_pos.y <= view_offset.y + view_size.y
	if inside_viewport:
		var tel_cross_col = Color(0.2, 0.9, 0.7, 0.16)
		# Draw horizontal dashed crosshair line
		_draw_dashed_line(Vector2(view_offset.x, mouse_pos.y), Vector2(view_offset.x + view_size.x, mouse_pos.y), tel_cross_col, 1.0, 4.0, 4.0)
		# Draw vertical dashed crosshair line
		_draw_dashed_line(Vector2(mouse_pos.x, view_offset.y), Vector2(mouse_pos.x, view_offset.y + view_size.y), tel_cross_col, 1.0, 4.0, 4.0)
		
		# Get Geographic coordinates at cursor
		var geo_coord = _pos_to_coords(mouse_pos)
		
		var cursor_label_font = get_theme_font("font")
		if cursor_label_font:
			# Left Margin Lat Box
			var lat_text = "%.3f° N" % geo_coord.x
			map_drawer.draw_rect(Rect2(Vector2(view_offset.x - 55, mouse_pos.y - 8), Vector2(50, 15)), Color(0.04, 0.04, 0.06, 0.85), true)
			map_drawer.draw_rect(Rect2(Vector2(view_offset.x - 55, mouse_pos.y - 8), Vector2(50, 15)), Color(0.2, 0.9, 0.7, 0.3), false, 1.0)
			map_drawer.draw_string(cursor_label_font, Vector2(view_offset.x - 51, mouse_pos.y + 3), lat_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 7, Color(0.2, 0.9, 0.7, 0.85))
			
			# Top Margin Lon Box
			var lon_text = "%.3f° E" % geo_coord.y
			map_drawer.draw_rect(Rect2(Vector2(mouse_pos.x - 26, view_offset.y - 20), Vector2(52, 15)), Color(0.04, 0.04, 0.06, 0.85), true)
			map_drawer.draw_rect(Rect2(Vector2(mouse_pos.x - 26, view_offset.y - 20), Vector2(52, 15)), Color(0.2, 0.9, 0.7, 0.3), false, 1.0)
			map_drawer.draw_string(cursor_label_font, Vector2(mouse_pos.x - 22, view_offset.y - 9), lon_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 7, Color(0.2, 0.9, 0.7, 0.85))
			
			# Box on the cursor itself
			var cur_box_text = "[ LAT:%.4f N / LON:%.4f E ]" % [geo_coord.x, geo_coord.y]
			map_drawer.draw_rect(Rect2(mouse_pos + Vector2(12, -22), Vector2(144, 14)), Color(0.04, 0.04, 0.06, 0.75), true)
			map_drawer.draw_rect(Rect2(mouse_pos + Vector2(12, -22), Vector2(144, 14)), Color(0.2, 0.9, 0.7, 0.25), false, 1.0)
			map_drawer.draw_string(cursor_label_font, mouse_pos + Vector2(16, -12), cur_box_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 7, Color(0.2, 0.9, 0.7, 0.75))

# ==========================================
# INTERACTIVE DRAGS AND SCROLLS
# ==========================================
func _input(event: InputEvent) -> void:
	# 1. Drag Panning via Middle/Right mouse button
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_RIGHT or event.button_index == MOUSE_BUTTON_MIDDLE:
			if event.pressed:
				is_dragging = true
				drag_start = event.position
			else:
				is_dragging = false
				
		# 2. Zoom Controls via mouse wheel
		if event.pressed:
			if event.button_index == MOUSE_BUTTON_WHEEL_UP:
				zoom_level = min(zoom_level + 0.1, MAX_ZOOM)
				camera.zoom = Vector2(zoom_level, zoom_level)
			elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				zoom_level = max(zoom_level - 0.1, MIN_ZOOM)
				camera.zoom = Vector2(zoom_level, zoom_level)
				
			# Click detection
			if event.button_index == MOUSE_BUTTON_LEFT:
				if not hovered_city_id.is_empty():
					_select_city(hovered_city_id)
					
	if event is InputEventMouseMotion:
		if is_dragging:
			var diff = event.position - drag_start
			camera.position -= diff / zoom_level
			drag_start = event.position
		else:
			# Track hover detection
			_detect_hover_nodes(event.position)

func _detect_hover_nodes(mouse_screen_pos: Vector2) -> void:
	# Translate screen coordinates into canvas coordinate offsets (accounting for camera pan/zoom)
	var canvas_pos = map_drawer.get_local_mouse_position()
	
	var old_hover = hovered_city_id
	hovered_city_id = ""
	
	for city_id in rendered_nodes:
		var node_pos = rendered_nodes[city_id]
		var dist = canvas_pos.distance_to(node_pos)
		
		# Node interactive threshold (within 24 pixels)
		if dist < 24.0:
			hovered_city_id = city_id
			break
			
	if hovered_city_id != old_hover:
		map_drawer.queue_redraw()

func _select_city(city_id: String) -> void:
	selected_city_id = city_id
	map_drawer.queue_redraw()
	
	var city = cities_data[city_id]
	city_name_lbl.text = city.name
	
	if city.is_schengen:
		schengen_val_lbl.text = "ZONE: ACTIVE SCHENGEN (LOW RISK)"
		schengen_val_lbl.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443))
	else:
		schengen_val_lbl.text = "ZONE: CUSTOM CHECKPOINT (WARNING)"
		schengen_val_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		
	# Redraw connections Side Panel lists
	for child in connection_list_box.get_children():
		if child.name != "Label":
			child.queue_free()
			
	for conn_id in city.connections:
		var conn = city.connections[conn_id]
		var dest_city = cities_data[conn_id].name
		
		var conn_lbl = Label.new()
		conn_lbl.theme_type_variation = "HeaderSmall"
		conn_lbl.add_theme_font_size_override("font_size", 13)
		
		var border_txt = " (Schengen)"
		if conn.get("is_border_crossing", false):
			border_txt = " [CUSTOM CROSSING]"
			conn_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		else:
			conn_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843))
			
		conn_lbl.text = "➔ %s : %d km%s" % [dest_city, conn.distance_km, border_txt]
		connection_list_box.add_child(conn_lbl)
		
	_log_console("Inspecting hub: %s." % city.name, Color(0.925, 0.607, 0.141))

# ==========================================
# UI THEME AND GAME STATE SYNC
# ==========================================
func _apply_hud_theme() -> void:
	var style_console = StyleBoxFlat.new()
	style_console.bg_color = Color(0.047, 0.051, 0.059, 1.0)
	style_console.border_color = Color(0.180, 0.803, 0.443, 0.3)
	style_console.border_width_left = 3
	style_console.content_margin_left = 12
	style_console.content_margin_top = 12
	style_console.content_margin_bottom = 12
	console_box.add_theme_stylebox_override("normal", style_console)
	
	var style_btn = StyleBoxFlat.new()
	style_btn.bg_color = Color(0, 0, 0, 0)
	style_btn.border_color = Color(0.901, 0.298, 0.235, 0.4)
	style_btn.border_width_bottom = 2
	style_btn.border_width_top = 2
	style_btn.border_width_left = 2
	style_btn.border_width_right = 2
	style_btn.set_corner_radius_all(4)
	back_menu_btn.add_theme_stylebox_override("normal", style_btn)

func _sync_hud_data() -> void:
	player_name_lbl.text = GameState.username.to_upper()
	_on_balances_updated(GameState.legal_balance, GameState.black_market_balance)
	_on_reputation_updated(GameState.reputation_score, GameState.police_heat)

func _on_balances_updated(legal_cash: float, dirty_cash: float) -> void:
	legal_balance_lbl.text = "$%s" % String.num(legal_cash, 2)
	black_balance_lbl.text = "$%s" % String.num(dirty_cash, 2)

func _on_reputation_updated(score: int, heat: int) -> void:
	rep_val_lbl.text = str(score)
	heat_val_lbl.text = "%d%%" % heat
	
	if heat > 50:
		heat_val_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235)) # High Heat = red label alert
	else:
		heat_val_lbl.add_theme_color_override("font_color", Color(1, 1, 1))

func _on_network_status_changed(connected: bool) -> void:
	if connected:
		_log_console("Network Status: Connected to logistics server.", Color(0.180, 0.803, 0.443))
	else:
		_log_console("Network Status: DISCONNECTED. Watchdog retrying...", Color(0.901, 0.298, 0.235))

func _log_console(text: String, color: Color) -> void:
	console_lbl.text = text
	console_lbl.add_theme_color_override("font_color", color)

func _on_back_pressed() -> void:
	NetworkManager.disconnect_from_server()
	SceneTransition.change_scene_to_file("res://scenes/main_menu/MainMenu.tscn")
