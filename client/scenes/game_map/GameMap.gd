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
@onready var camera: Camera2D = %Camera
@onready var map_drawer: Node2D = %VectorMapDrawer
@onready var map_container: Control = %MapContainer

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
var map_min_lat: float = 90.0
var map_max_lat: float = -90.0
var map_min_lon: float = 180.0
var map_max_lon: float = -180.0
const MAP_MARGIN = 150 # screen offset bounds
var view_size = Vector2(850, 480)
var view_offset = Vector2(100, 100)

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
	
	# 1. Establish min/max bounds to project coordinates correctly
	for city_id in cities_data:
		var coords = cities_data[city_id].coords
		var lat = float(coords.x)
		var lon = float(coords.y)
		
		if lat < map_min_lat: map_min_lat = lat
		if lat > map_max_lat: map_max_lat = lat
		if lon < map_min_lon: map_min_lon = lon
		if lon > map_max_lon: map_max_lon = lon
		
	# 2. Normalize and project latitude/longitude coordinates on viewport
	# Inverts Y because latitude runs positive UP (North) while Godot Y runs positive DOWN
	for city_id in cities_data:
		var city = cities_data[city_id]
		var lat = float(city.coords.x)
		var lon = float(city.coords.y)
		
		# Normalize lat/lon to range (0.0 to 1.0)
		var norm_x = (lon - map_min_lon) / (map_max_lon - map_min_lon) if map_max_lon != map_min_lon else 0.5
		var norm_y = (lat - map_min_lat) / (map_max_lat - map_min_lat) if map_max_lat != map_min_lat else 0.5
		
		# Invert Y for correct alignment
		norm_y = 1.0 - norm_y
		
		# Scale to fit center viewport dimensions
		var projected_pos = Vector2(
			view_offset.x + norm_x * view_size.x,
			view_offset.y + norm_y * view_size.y
		)
		
		rendered_nodes[city_id] = projected_pos
		
	# Center the camera inside projected bounds
	var mid_pos = Vector2(
		view_offset.x + view_size.x * 0.5,
		view_offset.y + view_size.y * 0.5
	)
	camera.position = mid_pos
	
	_log_console("Route network loaded: %d cities, projected correctly on vector dashboard." % cities_data.size(), Color(0.18, 0.8, 0.44))
	map_drawer.queue_redraw()

# ==========================================
# 2D VECTOR RENDERING (DRAW OVERRIDES)
# ==========================================
func _draw_vector_map() -> void:
	# 1. DRAW CONNECTION ROUTES (Underneath nodes)
	for city_id in cities_data:
		var city = cities_data[city_id]
		var start_pos = rendered_nodes[city_id]
		
		for conn_id in city.connections:
			if rendered_nodes.has(conn_id):
				var end_pos = rendered_nodes[conn_id]
				var conn = city.connections[conn_id]
				
				# Render path styling based on Schengen border laws
				var line_color = Color(0.180, 0.803, 0.443, 0.15) # Schengen paths: subtle transparent green
				var width = 2.0
				
				if conn.get("is_border_crossing", false):
					line_color = Color(0.925, 0.607, 0.141, 0.5) # Customs check lines: thick orange warning
					width = 3.5
					
				map_drawer.draw_line(start_pos, end_pos, line_color, width, true)

	# 2. DRAW CITY NODES (On top of routes)
	for city_id in cities_data:
		var city = cities_data[city_id]
		var pos = rendered_nodes[city_id]
		
		var radius = 10.0
		var outer_color = Color(0.180, 0.803, 0.443, 1.0) # Schengen Node: active green
		var inner_color = Color(0.070, 0.078, 0.090, 1.0) # Background fill
		
		if not city.is_schengen:
			outer_color = Color(0.925, 0.607, 0.141, 1.0) # Non-Schengen Node: orange threat
			
		# Hovered node changes size and glows amber/violet
		if city_id == hovered_city_id:
			radius = 14.0
			outer_color = Color(0.607, 0.349, 0.713, 1.0) # Violet hover indicator
			
		if city_id == selected_city_id:
			radius = 12.0
			outer_color = Color(1.0, 1.0, 1.0, 1.0) # Selected node is white highlighted

		# Draw layered vector circles
		map_drawer.draw_circle(pos, radius + 2, outer_color)
		map_drawer.draw_circle(pos, radius - 2, inner_color)

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
	%ConsoleBox.add_theme_stylebox_override("normal", style_console)
	
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
