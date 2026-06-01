extends Control

# ====================================================
# LogisticsAnalytics.gd — Programmatic Analytics Panel
# Unified control center for performance reports, active dispatches,
# and warehouse terminal upgrades.
# ====================================================

const BASE_URL = "http://localhost:3000"

var current_tab: String = "overview"
var performance_reports: Array = []
var active_dispatches: Array = []
var owned_garages: Array = []

var http_pending_count: int = 0
var feedback_message: String = ""
var feedback_color: Color = Color.WHITE

@onready var scene_root = $CanvasLayer
@onready var perf_request = $PerfRequest
@onready var active_routes_request = $ActiveRoutesRequest
@onready var garages_request = $GaragesRequest
@onready var upgrade_request = $UpgradeRequest

func _ready() -> void:
	# Configure HTTPRequest connections
	perf_request.request_completed.connect(_on_performance_response)
	active_routes_request.request_completed.connect(_on_active_routes_response)
	garages_request.request_completed.connect(_on_garages_response)
	upgrade_request.request_completed.connect(_on_upgrade_response)

	_build_ui()
	_fetch_all_data()

# ====================================================
# NETWORK COMMUNICATION
# ====================================================
func _fetch_all_data() -> void:
	http_pending_count = 3
	feedback_message = "Synchronizing data matrices..."
	feedback_color = Color(0.3, 0.7, 1.0, 1.0)
	_update_feedback()
	_set_loading(true)

	var token = GameState.auth_token
	var headers = ["Authorization: Bearer " + token]

	# 1. Fetch Performance History
	perf_request.request(BASE_URL + "/api/analytics/performance", headers, HTTPClient.METHOD_GET)

	# 2. Fetch Active Routes
	active_routes_request.request(BASE_URL + "/api/dispatch/active", headers, HTTPClient.METHOD_GET)

	# 3. Fetch Garages
	garages_request.request(BASE_URL + "/api/garage", headers, HTTPClient.METHOD_GET)

func _decrement_pending() -> void:
	http_pending_count -= 1
	if http_pending_count <= 0:
		_set_loading(false)
		feedback_message = "All telemetry streams synced."
		feedback_color = Color(0.2, 0.9, 0.4, 1.0)
		_update_feedback()
		_render_active_tab()

func _on_performance_response(_result, response_code, _headers, body) -> void:
	if response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_ARRAY:
			performance_reports = parsed
	_decrement_pending()

func _on_active_routes_response(_result, response_code, _headers, body) -> void:
	if response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_ARRAY:
			active_dispatches = parsed
	_decrement_pending()

func _on_garages_response(_result, response_code, _headers, body) -> void:
	if response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_ARRAY:
			owned_garages = parsed
			# Sync to GameState cache
			GameState.garages = parsed
	_decrement_pending()

func _upgrade_terminal(garage_id: String) -> void:
	feedback_message = "Transacting wire transfer to municipality..."
	feedback_color = Color(0.9, 0.6, 0.1, 1.0)
	_update_feedback()
	_set_loading(true)

	var token = GameState.auth_token
	var headers = [
		"Authorization: Bearer " + token,
		"Content-Type: application/json"
	]
	upgrade_request.request(
		BASE_URL + "/api/garage/" + garage_id + "/upgrade-terminal",
		headers,
		HTTPClient.METHOD_POST,
		"{}"
	)

func _on_upgrade_response(_result, response_code, _headers, body) -> void:
	_set_loading(false)
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		feedback_message = "Terminal Upgrade Approved! Speed multipliers integrated."
		feedback_color = Color(0.2, 0.9, 0.4, 1.0)
		# Update legal balance locally to avoid lag
		if parsed and parsed.has("garage"):
			var cost = 0
			# Infer cost based on previous level
			var prev_level = int(parsed.garage.terminalLevel) - 1
			if prev_level == 1: cost = 100000
			elif prev_level == 2: cost = 500000
			elif prev_level == 3: cost = 2500000
			GameState.update_balances(-cost, 0.0)
		_fetch_all_data()
	else:
		var err_msg = "Upgrade rejected by municipality."
		if parsed and parsed.has("message"):
			err_msg = parsed.message
		feedback_message = "❌ Error: " + err_msg
		feedback_color = Color(1.0, 0.3, 0.3, 1.0)
		_update_feedback()

# ====================================================
# UI GENERATION
# ====================================================
func _build_ui() -> void:
	# Clean existing canvas
	for child in scene_root.get_children():
		child.queue_free()

	# Main background
	var bg = ColorRect.new()
	bg.color = Color(0.04, 0.04, 0.06, 1.0)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scene_root.add_child(bg)

	# Technical grids
	for i in range(12):
		var line = ColorRect.new()
		line.color = Color(0.08, 0.08, 0.12, 0.3)
		line.position = Vector2(0, 60 * i)
		line.size = Vector2(1280, 1)
		scene_root.add_child(line)
		
	for j in range(20):
		var line = ColorRect.new()
		line.color = Color(0.08, 0.08, 0.12, 0.3)
		line.position = Vector2(64 * j, 0)
		line.size = Vector2(1, 720)
		scene_root.add_child(line)

	# 1. HEADER PANEL
	var header = _panel(Vector2(0, 0), Vector2(1280, 75), Color(0.05, 0.05, 0.08, 0.95))
	scene_root.add_child(header)

	var title_lbl = Label.new()
	title_lbl.text = "📊  LOGISTICS CONTROL & INDUSTRIAL ANALYTICS"
	title_lbl.add_theme_font_size_override("font_size", 18)
	title_lbl.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0, 1.0))
	title_lbl.position = Vector2(25, 25)
	header.add_child(title_lbl)

	# Balance Readout in Header
	var balance_lbl = Label.new()
	balance_lbl.name = "HeaderBalanceLabel"
	balance_lbl.add_theme_font_size_override("font_size", 13)
	balance_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5, 1.0))
	balance_lbl.position = Vector2(500, 28)
	header.add_child(balance_lbl)
	_update_header_balance()

	var back_btn = _button("◀  BACK TO MAP", Vector2(1140, 18), Vector2(115, 38))
	back_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn"))
	header.add_child(back_btn)

	var refresh_btn = _button("↻  REFRESH DATA", Vector2(1010, 18), Vector2(115, 38))
	refresh_btn.pressed.connect(_fetch_all_data)
	header.add_child(refresh_btn)

	# 2. STATUS FEEDBACK BAR
	var status_strip = _panel(Vector2(0, 75), Vector2(1280, 45), Color(0.06, 0.06, 0.09, 0.95))
	scene_root.add_child(status_strip)

	var status_lbl = Label.new()
	status_lbl.name = "StatusLabel"
	status_lbl.text = feedback_message
	status_lbl.add_theme_font_size_override("font_size", 12)
	status_lbl.add_theme_color_override("font_color", feedback_color)
	status_lbl.position = Vector2(25, 13)
	status_strip.add_child(status_lbl)

	# 3. TAB BAR NAVIGATION
	var tab_bar = HBoxContainer.new()
	tab_bar.position = Vector2(20, 130)
	tab_bar.size = Vector2(1240, 48)
	tab_bar.name = "TabBar"
	scene_root.add_child(tab_bar)

	_add_tab_button(tab_bar, "overview", "📈  PERFORMANCE DASHBOARD", Color(0.2, 0.8, 1.0))
	_add_tab_button(tab_bar, "routes", "🚛  ACTIVE DISPATCH FLEET", Color(1.0, 0.3, 0.8))
	_add_tab_button(tab_bar, "terminals", "🏬  WAREHOUSE TERMINALS", Color(0.2, 0.9, 0.5))

	# 4. CONTENT SCROLL FRAME
	var scroll = ScrollContainer.new()
	scroll.position = Vector2(20, 190)
	scroll.size = Vector2(1240, 465)
	scroll.name = "ContentScroll"
	scene_root.add_child(scroll)

	var list_box = VBoxContainer.new()
	list_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_box.name = "ListBox"
	scroll.add_child(list_box)

	# 5. FOOTER FRAME
	var footer = _panel(Vector2(0, 665), Vector2(1280, 55), Color(0.05, 0.05, 0.07, 0.95))
	scene_root.add_child(footer)

	var footer_lbl = Label.new()
	footer_lbl.text = "Nighthaul Corp 2026. Secure telemetry layer operating under sovereign TLS handshakes."
	footer_lbl.add_theme_font_size_override("font_size", 11)
	footer_lbl.add_theme_color_override("font_color", Color(0.35, 0.35, 0.45, 1.0))
	footer_lbl.position = Vector2(25, 18)
	footer.add_child(footer_lbl)

	# Loading Spinner
	var loading = Label.new()
	loading.name = "LoadingSpinner"
	loading.text = "⚡ TELEMETRY UPLINK PENDING..."
	loading.add_theme_font_size_override("font_size", 16)
	loading.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0, 1.0))
	loading.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	loading.visible = false
	scene_root.add_child(loading)

func _add_tab_button(bar: HBoxContainer, tab_id: String, label: String, active_col: Color) -> void:
	var btn = Button.new()
	btn.text = label
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.custom_minimum_size = Vector2(0, 48)
	btn.add_theme_font_size_override("font_size", 13)
	btn.pressed.connect(func(): _switch_tab(tab_id))
	
	if current_tab == tab_id:
		btn.add_theme_color_override("font_color", active_col)
	else:
		btn.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55, 1.0))
		
	btn.name = "TabBtn_" + tab_id
	bar.add_child(btn)

func _switch_tab(tab_id: String) -> void:
	current_tab = tab_id
	var tab_bar = _find_node(scene_root, "TabBar")
	if tab_bar:
		for btn in tab_bar.get_children():
			if btn is Button:
				var tid = btn.name.replace("TabBtn_", "")
				if tid == tab_id:
					var col = Color(0.2, 0.8, 1.0)
					if tid == "routes": col = Color(1.0, 0.3, 0.8)
					elif tid == "terminals": col = Color(0.2, 0.9, 0.5)
					btn.add_theme_color_override("font_color", col)
				else:
					btn.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55, 1.0))
	_render_active_tab()

func _update_feedback() -> void:
	var lbl = _find_node(scene_root, "StatusLabel")
	if lbl:
		lbl.text = feedback_message
		lbl.add_theme_color_override("font_color", feedback_color)

func _update_header_balance() -> void:
	var lbl = _find_node(scene_root, "HeaderBalanceLabel")
	if lbl:
		lbl.text = "Clean Cash: $%s   |   Black Cash: $%s" % [
			_fmt_cash(GameState.legal_balance),
			_fmt_cash(GameState.black_market_balance)
		]

func _set_loading(is_loading: bool) -> void:
	var spinner = _find_node(scene_root, "LoadingSpinner")
	var scroll = _find_node(scene_root, "ContentScroll")
	if spinner:
		spinner.visible = is_loading
	if scroll:
		scroll.visible = !is_loading

# ====================================================
# TAB RENDERERS
# ====================================================
func _render_active_tab() -> void:
	_update_header_balance()
	var list_box = _find_node(scene_root, "ListBox")
	if not list_box:
		return
		
	# Clear previous entries
	for child in list_box.get_children():
		child.queue_free()

	match current_tab:
		"overview":
			_render_overview_tab(list_box)
		"routes":
			_render_routes_tab(list_box)
		"terminals":
			_render_terminals_tab(list_box)

# --- 1. OVERVIEW TAB ---
func _render_overview_tab(parent: Node) -> void:
	if performance_reports.is_empty():
		var empty_panel = _card_panel(Vector2(1240, 180), Color(0.06, 0.06, 0.08, 0.8))
		parent.add_child(empty_panel)
		var label = Label.new()
		label.text = "📈  NO HISTORICAL REPORT RECORDS DETECTED YET\nLaunch dispatches, complete cargos, and avoid smuggling busts to populate database telemetry!"
		label.add_theme_font_size_override("font_size", 14)
		label.add_theme_color_override("font_color", Color(0.4, 0.5, 0.6, 1.0))
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
		empty_panel.add_child(label)
		return

	# Cumulative calculations
	var total_dispatches = 0
	var total_completed = 0
	var total_tonnage_kg = 0.0
	var total_legal_rev = 0.0
	var total_black_rev = 0.0
	var total_fuel_exp = 0.0
	var total_repair_exp = 0.0
	var total_bribe_exp = 0.0
	var total_interest_exp = 0.0

	for r in performance_reports:
		total_dispatches += int(r.get("routesDispatchedCount", 0))
		total_completed += int(r.get("routesCompletedCount", 0))
		total_tonnage_kg += _safe_float(r.get("tonnageDeliveredKg", 0))
		total_legal_rev += _safe_float(r.get("revenueLegal", 0))
		total_black_rev += _safe_float(r.get("revenueBlack", 0))
		total_fuel_exp += _safe_float(r.get("expenseFuel", 0))
		total_repair_exp += _safe_float(r.get("expenseRepairs", 0))
		total_bribe_exp += _safe_float(r.get("expenseBribesFines", 0))
		total_interest_exp += _safe_float(r.get("expenseInterest", 0))

	var net_profit = (total_legal_rev + total_black_rev) - (total_fuel_exp + total_repair_exp + total_bribe_exp + total_interest_exp)

	# Grid metrics container
	var grid = GridContainer.new()
	grid.columns = 3
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 15)
	grid.add_theme_constant_override("v_separation", 15)
	parent.add_child(grid)

	_add_metric_card(grid, "COMPLETED CONTRACTS", "%d / %d" % [total_completed, total_dispatches], Color(0.2, 0.8, 1.0, 1.0))
	_add_metric_card(grid, "TOTAL TONNAGE ROUTED", "%.1f TONS" % (total_tonnage_kg / 1000.0), Color(0.9, 0.7, 0.2, 1.0))
	_add_metric_card(grid, "NET BALANCED PROFITS", "$%s" % _fmt_cash(net_profit), Color(0.2, 0.9, 0.5, 1.0) if net_profit >= 0 else Color(1.0, 0.3, 0.3, 1.0))
	_add_metric_card(grid, "WHITE CASH REVENUE", "$%s" % _fmt_cash(total_legal_rev), Color(0.3, 0.9, 0.6, 1.0))
	_add_metric_card(grid, "BLACK MARKET PROCEEDS", "$%s" % _fmt_cash(total_black_rev), Color(0.8, 0.3, 1.0, 1.0))
	_add_metric_card(grid, "OPERATIONAL EXPENDITURES", "$%s" % _fmt_cash(total_fuel_exp + total_repair_exp + total_bribe_exp + total_interest_exp), Color(1.0, 0.4, 0.3, 1.0))

	# Decorative label for chart
	var chart_title = Label.new()
	chart_title.text = "\n📈  REVENUE HISTOGRAM — DAILY MATRICES"
	chart_title.add_theme_font_size_override("font_size", 14)
	chart_title.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0, 1.0))
	parent.add_child(chart_title)

	# Bar Chart Frame
	var chart_panel = _card_panel(Vector2(1240, 200), Color(0.06, 0.06, 0.08, 0.9))
	parent.add_child(chart_panel)

	var bar_container = HBoxContainer.new()
	bar_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bar_container.alignment = BoxContainer.ALIGNMENT_CENTER
	bar_container.add_theme_constant_override("separation", 35)
	chart_panel.add_child(bar_container)

	# Render vertical bar chart
	var max_val = 1.0
	for report in performance_reports:
		var rev = _safe_float(report.get("revenueLegal", 0)) + _safe_float(report.get("revenueBlack", 0))
		max_val = max(max_val, rev)

	for report in performance_reports:
		var date = str(report.get("dateStr", "Unknown")).substr(5) # MM-DD
		var legal = _safe_float(report.get("revenueLegal", 0))
		var black = _safe_float(report.get("revenueBlack", 0))
		var total = legal + black
		var height_ratio = total / max_val

		var day_vbox = VBoxContainer.new()
		day_vbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
		bar_container.add_child(day_vbox)

		# Top spacer
		var spacer = Control.new()
		spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
		day_vbox.add_child(spacer)

		# Legal segment
		var val_lbl = Label.new()
		val_lbl.text = "$%s" % _fmt_short(total)
		val_lbl.add_theme_font_size_override("font_size", 10)
		val_lbl.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9, 1.0))
		val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		day_vbox.add_child(val_lbl)

		# Colorful bars representing legal and illicit shares
		var bar_node = Control.new()
		bar_node.custom_minimum_size = Vector2(40, max(120.0 * height_ratio, 10.0))
		day_vbox.add_child(bar_node)

		var bg_bar = ColorRect.new()
		bg_bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		bg_bar.color = Color(0.2, 0.8, 0.5, 0.9) if black == 0.0 else Color(0.6, 0.4, 0.9, 0.9)
		bar_node.add_child(bg_bar)

		# Label MM-DD
		var date_lbl = Label.new()
		date_lbl.text = date
		date_lbl.add_theme_font_size_override("font_size", 11)
		date_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
		date_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		day_vbox.add_child(date_lbl)

func _add_metric_card(grid_node: Node, title: String, value: String, col: Color) -> void:
	var card = _card_panel(Vector2(400, 100), Color(0.06, 0.06, 0.09, 0.85))
	card.custom_minimum_size = Vector2(395, 100)
	grid_node.add_child(card)

	# Thin glowing vertical left boundary
	var glow_border = ColorRect.new()
	glow_border.color = col
	glow_border.size = Vector2(3, 100)
	card.add_child(glow_border)

	var title_lbl = Label.new()
	title_lbl.text = title
	title_lbl.add_theme_font_size_override("font_size", 11)
	title_lbl.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55, 1.0))
	title_lbl.position = Vector2(20, 20)
	card.add_child(title_lbl)

	var val_lbl = Label.new()
	val_lbl.text = value
	val_lbl.add_theme_font_size_override("font_size", 22)
	val_lbl.add_theme_color_override("font_color", Color.WHITE)
	val_lbl.position = Vector2(20, 45)
	card.add_child(val_lbl)

# --- 2. ROUTES TAB ---
func _render_routes_tab(parent: Node) -> void:
	if active_dispatches.is_empty():
		var empty_panel = _card_panel(Vector2(1240, 180), Color(0.06, 0.06, 0.08, 0.8))
		parent.add_child(empty_panel)
		var label = Label.new()
		label.text = "🚛  NO FLEET VEHICLES CURRENTLY ON HIGHWAY CORRIDORS\nNavigate to the Contract Board to dispatch drivers on active legal or underworld routes."
		label.add_theme_font_size_override("font_size", 14)
		label.add_theme_color_override("font_color", Color(0.4, 0.5, 0.6, 1.0))
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
		empty_panel.add_child(label)
		return

	for route in active_dispatches:
		var has_contraband = route.get("contrabandJobId") != null
		var border_check = route.get("isUnderBorderCheck", false)
		var is_paused = route.get("isPaused", false)
		
		# Set styling according to job class
		var accent_color = Color(0.2, 0.8, 1.0, 1.0) # Blue for legal
		if has_contraband:
			accent_color = Color(1.0, 0.3, 0.8, 1.0) # Magenta for illicit

		var route_panel = _card_panel(Vector2(1240, 115), Color(0.06, 0.06, 0.09, 0.9))
		route_panel.custom_minimum_size = Vector2(1240, 115)
		parent.add_child(route_panel)

		# Glowing left edge
		var edge = ColorRect.new()
		edge.color = accent_color
		edge.size = Vector2(3, 115)
		route_panel.add_child(edge)

		# Path Title: Vilnius -> Riga
		var origin = ""
		var dest = ""
		var cargo = "Unknown Cargo"
		var weight = 0.0
		var payout_text = ""

		if route.get("legalContract") != null:
			origin = route.legalContract.origin
			dest = route.legalContract.destination
			cargo = route.legalContract.cargoType
			weight = _safe_float(route.legalContract.get("distanceKm", 100.0)) * 40.0 # hypothetical
			payout_text = "$%s Clean Cash" % _fmt_cash(_safe_float(route.legalContract.payoutLegal))
		elif route.get("contrabandJob") != null:
			origin = route.contrabandJob.origin
			dest = route.contrabandJob.destination
			cargo = route.contrabandJob.cargoClass
			payout_text = "$%s Black Cash" % _fmt_cash(_safe_float(route.contrabandJob.payoutBlack))

		var path_lbl = Label.new()
		path_lbl.text = "📍 %s  ➔  %s" % [origin.toUpperCase(), dest.toUpperCase()]
		path_lbl.add_theme_font_size_override("font_size", 15)
		path_lbl.add_theme_color_override("font_color", Color.WHITE)
		path_lbl.position = Vector2(25, 15)
		route_panel.add_child(path_lbl)

		# Tag Label (SMUGGLING / CONTRACT)
		var tag = Label.new()
		tag.text = "[ ILLECIT SMUGGLE ]" if has_contraband else "[ LEGAL CARGO ]"
		tag.add_theme_font_size_override("font_size", 11)
		tag.add_theme_color_override("font_color", accent_color)
		tag.position = Vector2(1070, 18)
		route_panel.add_child(tag)

		# Detail line: Driver and vehicle
		var truck_mod = "Standard"
		if route.has("truck") and route.truck != null:
			truck_mod = route.truck.model
		var driver_name = "Assigned Driver"
		var fatigue = 0
		if route.has("driver") and route.driver != null:
			driver_name = route.driver.name
			fatigue = int(route.driver.fatigue)

		var det_lbl = Label.new()
		det_lbl.text = "🚚  Vehicle: %s   |   👤  Driver: %s (Fatigue: %d%%)   |   📦  Freight: %s   |   💰  Yield: %s" % [
			truck_mod, driver_name, fatigue, cargo, payout_text
		]
		det_lbl.add_theme_font_size_override("font_size", 12)
		det_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8, 1.0))
		det_lbl.position = Vector2(25, 45)
		route_panel.add_child(det_lbl)

		# Progress bar
		var prog = ProgressBar.new()
		prog.position = Vector2(25, 75)
		prog.size = Vector2(1190, 20)
		prog.value = _safe_float(route.get("progressPct", 0.0))
		route_panel.add_child(prog)

		# Override styling for border alerts / fuel pauses
		if border_check:
			var overlay = ColorRect.new()
			overlay.color = Color(0.8, 0.1, 0.1, 0.15)
			overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			route_panel.add_child(overlay)

			var alert = Label.new()
			alert.text = "⚠️ UNDER BORDER INSPECTION"
			alert.add_theme_font_size_override("font_size", 11)
			alert.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
			alert.position = Vector2(900, 18)
			route_panel.add_child(alert)
		elif is_paused:
			var alert = Label.new()
			alert.text = "⚠️ VEHICLE STALLED - OUT OF FUEL"
			alert.add_theme_font_size_override("font_size", 11)
			alert.add_theme_color_override("font_color", Color(1.0, 0.6, 0.1, 1.0))
			alert.position = Vector2(850, 18)
			route_panel.add_child(alert)

# --- 3. TERMINALS TAB ---
func _render_terminals_tab(parent: Node) -> void:
	if owned_garages.is_empty():
		return

	for garage in owned_garages:
		var city = garage.get("city", "Unknown depot")
		var level = int(garage.get("terminalLevel", 1))
		var max_cap = int(garage.get("capacity", 3))
		var active_trucks = 0
		if garage.has("trucks") and typeof(garage.trucks) == TYPE_ARRAY:
			active_trucks = garage.trucks.size()

		var card = _card_panel(Vector2(1240, 175), Color(0.06, 0.06, 0.09, 0.9))
		card.custom_minimum_size = Vector2(1240, 175)
		parent.add_child(card)

		# Glowing left edge
		var edge = ColorRect.new()
		edge.color = Color(0.2, 0.9, 0.5, 1.0)
		edge.size = Vector2(3, 175)
		card.add_child(edge)

		# Title
		var title = Label.new()
		title.text = "🏬  %s DEPOT STATION — TERMINAL LEVEL %d / 4" % [city.toUpperCase(), level]
		title.add_theme_font_size_override("font_size", 16)
		title.add_theme_color_override("font_color", Color.WHITE)
		title.position = Vector2(25, 20)
		card.add_child(title)

		# Terminal status text
		var cap_lbl = Label.new()
		cap_lbl.text = "Fleet Yard Utilization: %d / %d Vehicles Housed" % [active_trucks, max_cap]
		cap_lbl.add_theme_font_size_override("font_size", 12)
		cap_lbl.add_theme_color_override("font_color", Color(0.55, 0.6, 0.7, 1.0))
		cap_lbl.position = Vector2(25, 48)
		card.add_child(cap_lbl)

		# Storage capacity details
		var storage_lbl = Label.new()
		storage_lbl.text = "Commodity Silos: Diesel Cap: %dL   |   Electricity Grid Cap: %d kWh   |   AdBlue Bulk Cap: %d L" % [
			int(garage.get("maxDiesel", 5000)),
			int(garage.get("maxElectricity", 1000)),
			int(garage.get("maxAdblue", 500))
		]
		storage_lbl.add_theme_font_size_override("font_size", 11)
		storage_lbl.add_theme_color_override("font_color", Color(0.4, 0.7, 1.0, 1.0))
		storage_lbl.position = Vector2(25, 75)
		card.add_child(storage_lbl)

		# Operational Speed multipliers
		var speed_bonus = ""
		var cap_benefit = ""
		match level:
			1: 
				speed_bonus = "Standard Throughput Operations"
				cap_benefit = "Maximum operations restricted: weight < 10 Tons, distance < 200 km"
			2: 
				speed_bonus = "+25% Cargo Loading Multiplier"
				cap_benefit = "Upgraded operations: weight < 18 Tons, distance < 500 km"
			3: 
				speed_bonus = "+50% Cargo Loading Multiplier"
				cap_benefit = "Expanded operations: weight < 26 Tons, no Heavy/Steel cargo, distance unlimited"
			4: 
				speed_bonus = "+75% Cargo Loading Multiplier (MAX LEVEL)"
				cap_benefit = "Elite logistics tier: unlimited weight, class, and destination distance"

		var speed_lbl = Label.new()
		speed_lbl.text = "⚡ Speed Index: %s\n📦 Operations Bracket: %s" % [speed_bonus, cap_benefit]
		speed_lbl.add_theme_font_size_override("font_size", 11)
		speed_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5, 0.9))
		speed_lbl.position = Vector2(25, 105)
		card.add_child(speed_lbl)

		# Upgrade Button
		var up_btn = Button.new()
		up_btn.size = Vector2(260, 42)
		up_btn.position = Vector2(950, 66)
		up_btn.add_theme_font_size_override("font_size", 12)
		card.add_child(up_btn)

		if level >= 4:
			up_btn.text = "🏬 MAXIMUM LEVEL REACHED"
			up_btn.disabled = true
			up_btn.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5, 1.0))
		else:
			var cost = 0
			if level == 1: cost = 100000
			elif level == 2: cost = 500000
			elif level == 3: cost = 2500000

			up_btn.text = "UPGRADE TERMINAL LEVEL\nCost: $%s Clean Cash" % _fmt_cash(cost)
			
			if GameState.legal_balance < cost:
				up_btn.disabled = true
				up_btn.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4, 0.7))
			else:
				up_btn.disabled = false
				up_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5, 1.0))
				var gid = String(garage.id)
				up_btn.pressed.connect(func(): _upgrade_terminal(gid))

# ====================================================
# CUSTOM DRAWING & PRIMITIVE HELPERS
# ====================================================
func _panel(pos: Vector2, sz: Vector2, color: Color) -> PanelContainer:
	var p = PanelContainer.new()
	p.position = pos
	p.size = sz
	var style = StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(0.12, 0.12, 0.18, 0.8)
	style.border_width_bottom = 1
	style.border_width_top = 1
	p.add_theme_stylebox_override("panel", style)
	return p

func _card_panel(sz: Vector2, color: Color) -> PanelContainer:
	var p = PanelContainer.new()
	p.size = sz
	var style = StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(0.15, 0.15, 0.22, 0.8)
	style.border_width_bottom = 1
	style.border_width_top = 1
	style.border_width_left = 1
	style.border_width_right = 1
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_left = 4
	style.corner_radius_bottom_right = 4
	p.add_theme_stylebox_override("panel", style)
	return p

func _button(label_text: String, pos: Vector2, sz: Vector2) -> Button:
	var btn = Button.new()
	btn.text = label_text
	btn.position = pos
	btn.size = sz
	btn.add_theme_font_size_override("font_size", 12)
	btn.add_theme_color_override("font_color", Color(0.2, 0.8, 1.0, 1.0))
	return btn

func _safe_float(val) -> float:
	if val == null:
		return 0.0
	if typeof(val) == TYPE_DICTIONARY:
		if val.has("val"):
			return float(val.val)
	if typeof(val) == TYPE_STRING:
		return float(val)
	if typeof(val) == TYPE_FLOAT or typeof(val) == TYPE_INT:
		return float(val)
	return 0.0

func _fmt_cash(n: float) -> String:
	var integer_part = int(n)
	var s = str(integer_part)
	var formatted = ""
	var count = 0
	for i in range(s.length() - 1, -1, -1):
		formatted = s[i] + formatted
		count += 1
		if count % 3 == 0 and i > 0:
			formatted = "," + formatted
	return formatted

func _fmt_short(n: float) -> String:
	if n >= 1000000.0: return "%.1fM" % (n / 1000000.0)
	if n >= 1000.0: return "%.1fK" % (n / 1000.0)
	return "%.1f" % n

func _find_node(root: Node, target_name: String) -> Node:
	if root.name == target_name:
		return root
	for child in root.get_children():
		var r = _find_node(child, target_name)
		if r:
			return r
	return null
