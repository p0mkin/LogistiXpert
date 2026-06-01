extends Control

# ====================================================
# PartsShop.gd — Parts Catalog & Truck Rigging Scene
# Maintenance items (legal cash) + Underworld mods (black market)
# Live truck health bars, blueprint visualizer, purchase flow
# ====================================================

const BASE_URL = "http://localhost:3000"

# ------ CATALOG (mirrors server PARTS_CATALOG) ------
const CATALOG = [
	{
		"id": "engine_kit",
		"name": "Engine Overhaul Kit",
		"category": "MAINTENANCE",
		"cost": 1800,
		"currency": "LEGAL",
		"icon": "⚙",
		"color": Color(0.2, 0.85, 0.45, 1.0),
		"stat_effect": "+25% Engine Health",
		"description": "Replaces worn gaskets, seals and head hardware. Prevents catastrophic cylinder failure on Baltic highway hauls.",
	},
	{
		"id": "tires_set",
		"name": "High-Performance Fleet Tires",
		"category": "MAINTENANCE",
		"cost": 900,
		"currency": "LEGAL",
		"icon": "🔘",
		"color": Color(0.2, 0.85, 0.45, 1.0),
		"stat_effect": "+30% Tire Wear",
		"description": "Continental full-spec 315/70R22.5 long-haul composite rubber. Improves fuel economy and cornering on wet Polish highways.",
	},
	{
		"id": "false_bottom",
		"name": "False-Bottom Fuel Tank",
		"category": "RIGGING",
		"cost": 5000,
		"currency": "BLACK_MARKET",
		"icon": "🛢",
		"color": Color(0.75, 0.3, 1.0, 1.0),
		"stat_effect": "Hides Class A/B cargo — -50L fuel cap",
		"description": "Sacrifices 50L maximum fuel capacity to hollow out a pressurized volume compartment. Invisible to visual customs checks.",
	},
	{
		"id": "chassis_cavity",
		"name": "Hidden Chassis Cavity",
		"category": "RIGGING",
		"cost": 12000,
		"currency": "BLACK_MARKET",
		"icon": "🔩",
		"color": Color(0.75, 0.3, 1.0, 1.0),
		"stat_effect": "Large stash — -15% fuel efficiency",
		"description": "Structural frame cavities welded shut with dual-latched access panels. Double-volume smuggling stash. Degrades aerodynamics visibly.",
	},
	{
		"id": "tacho_spoofer",
		"name": "ECU Tachograph Spoofer",
		"category": "RIGGING",
		"cost": 8500,
		"currency": "BLACK_MARKET",
		"icon": "💾",
		"color": Color(1.0, 0.5, 0.1, 1.0),
		"stat_effect": "Fakes Schengen tacho logs — seizure risk",
		"description": "Riga-sourced ECU firmware patch. Clones a legal rest log into the digital tachograph. High reward, catastrophic if discovered at deep scan.",
	},
	{
		"id": "shielding_lvl",
		"name": "Lead Scanner Shielding (Lvl +1)",
		"category": "RIGGING",
		"cost": 3500,
		"currency": "BLACK_MARKET",
		"icon": "🛡",
		"color": Color(0.3, 0.6, 1.0, 1.0),
		"stat_effect": "-10% X-Ray/K9 detection per level (max 5)",
		"description": "Lead-alloy lined sleeper compartment plating. Absorbs X-Ray scatter and disrupts EM scans. Stackable up to Level 5.",
	},
]

var selected_item: Dictionary = {}
var selected_truck_id: String = ""
var player_trucks: Array = []

@onready var scene_root = $CanvasLayer
@onready var http = $HTTPRequest
@onready var buy_http = $BuyHTTPRequest
@onready var fleet_http = $FleetHTTPRequest

func _ready() -> void:
	_build_ui()
	_fetch_fleet()

# ====================================================
# BUILD UI
# ====================================================
func _build_ui() -> void:
	# Programmatic High-Fidelity Animated HUD Background
	var bg = CyberGridBackground.new()
	scene_root.add_child(bg)

	# HEADER
	var hdr = _panel(Vector2(0, 0), Vector2(1280, 64), Color(0.04, 0.05, 0.08, 0.95), Color(0.2, 0.9, 0.7, 0.35))
	scene_root.add_child(hdr)

	var title = Label.new()
	title.text = "🔧  PARTS & RIGGING SHOP  —  NIGHTHAUL FLEET SERVICES"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.85, 0.65, 1.0, 1.0))
	title.position = Vector2(20, 18)
	hdr.add_child(title)

	var back_btn = _btn("◀  MAP", Vector2(1170, 12), Vector2(90, 40))
	back_btn.pressed.connect(_go_back)
	hdr.add_child(back_btn)

	# TRUCK SELECTOR BAR
	var truck_bar = _panel(Vector2(0, 64), Vector2(1280, 52), Color(0.04, 0.04, 0.06, 0.92), Color(0.2, 0.9, 0.7, 0.2))
	truck_bar.name = "TruckBar"
	scene_root.add_child(truck_bar)

	var ts_lbl = Label.new()
	ts_lbl.text = "🚛  SELECT TRUCK:"
	ts_lbl.add_theme_font_size_override("font_size", 12)
	ts_lbl.add_theme_color_override("font_color", Color(0.6, 0.55, 0.75, 1.0))
	ts_lbl.position = Vector2(16, 16)
	truck_bar.add_child(ts_lbl)

	var ts = OptionButton.new()
	ts.position = Vector2(148, 10)
	ts.size = Vector2(560, 34)
	ts.name = "TruckSelect"
	ts.add_item("Loading fleet...")
	ts.item_selected.connect(_on_truck_selected)
	truck_bar.add_child(ts)

	# Balance strip on right of truck bar
	var bal_lbl = Label.new()
	bal_lbl.text = "💵 $%.0f Legal   💜 $%.0f BM" % [GameState.legal_balance, GameState.black_market_balance]
	bal_lbl.add_theme_font_size_override("font_size", 12)
	bal_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8, 1.0))
	bal_lbl.position = Vector2(780, 17)
	bal_lbl.name = "BalanceLabel"
	truck_bar.add_child(bal_lbl)

	# THREE-COLUMN LAYOUT (y=120)
	# Left: Catalog list
	var cat_panel = _panel(Vector2(12, 122), Vector2(420, 548), Color(0.04, 0.04, 0.07, 0.85), Color(0.65, 0.45, 1.0, 0.3))
	cat_panel.name = "CatalogPanel"
	scene_root.add_child(cat_panel)

	var cat_title = Label.new()
	cat_title.text = "📋  CATALOG"
	cat_title.add_theme_font_size_override("font_size", 14)
	cat_title.add_theme_color_override("font_color", Color(0.8, 0.65, 1.0, 1.0))
	cat_title.position = Vector2(12, 10)
	cat_panel.add_child(cat_title)

	# Category filter buttons
	var fa = _btn("ALL", Vector2(12, 38), Vector2(60, 26))
	fa.pressed.connect(func(): _render_catalog("ALL"))
	cat_panel.add_child(fa)
	var fm = _btn("MAINTENANCE", Vector2(78, 38), Vector2(130, 26))
	fm.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5, 1.0))
	fm.pressed.connect(func(): _render_catalog("MAINTENANCE"))
	cat_panel.add_child(fm)
	var fr = _btn("RIGGING", Vector2(214, 38), Vector2(90, 26))
	fr.add_theme_color_override("font_color", Color(0.75, 0.3, 1.0, 1.0))
	fr.pressed.connect(func(): _render_catalog("RIGGING"))
	cat_panel.add_child(fr)

	var cat_scroll = ScrollContainer.new()
	cat_scroll.position = Vector2(8, 74)
	cat_scroll.size = Vector2(404, 466)
	cat_scroll.name = "CatalogScroll"
	cat_panel.add_child(cat_scroll)

	var cat_list = VBoxContainer.new()
	cat_list.name = "CatalogList"
	cat_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cat_scroll.add_child(cat_list)

	# Center: Item detail + purchase
	var det_panel = _panel(Vector2(440, 122), Vector2(430, 548), Color(0.04, 0.04, 0.07, 0.85), Color(0.95, 0.7, 0.15, 0.3))
	det_panel.name = "DetailPanel"
	scene_root.add_child(det_panel)
	_render_detail_placeholder()

	# Right: Truck blueprint + health monitor
	var truck_panel = _panel(Vector2(878, 122), Vector2(390, 548), Color(0.04, 0.04, 0.07, 0.85), Color(0.2, 0.9, 0.7, 0.3))
	truck_panel.name = "TruckPanel"
	scene_root.add_child(truck_panel)
	_render_truck_panel_empty()

	# Status / toast bar at bottom
	var status_bar = _panel(Vector2(0, 678), Vector2(1280, 42), Color(0.04, 0.04, 0.06, 0.95), Color(0.2, 0.9, 0.7, 0.2))
	scene_root.add_child(status_bar)
	var status_lbl = Label.new()
	status_lbl.text = "Select a truck to view its current health. Purchase parts to restore performance or install underworld mods."
	status_lbl.add_theme_font_size_override("font_size", 11)
	status_lbl.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55, 1.0))
	status_lbl.position = Vector2(16, 13)
	status_lbl.name = "StatusLabel"
	status_bar.add_child(status_lbl)

	# Render initial catalog
	_render_catalog("ALL")

# ====================================================
# FLEET FETCHING
# ====================================================
func _fetch_fleet() -> void:
	var token = GameState.auth_token
	fleet_http.request(
		BASE_URL + "/api/garage",
		["Authorization: Bearer " + token],
		HTTPClient.METHOD_GET
	)
	fleet_http.request_completed.connect(_on_fleet_response, CONNECT_ONE_SHOT)

func _on_fleet_response(_r, code, _h, body) -> void:
	if code != 200:
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not parsed:
		return

	player_trucks = []
	var trucks_raw = []
	if parsed is Array:
		trucks_raw = parsed
	elif parsed is Dictionary and parsed.has("trucks"):
		trucks_raw = parsed.trucks

	for t in trucks_raw:
		player_trucks.append(t)

	# Populate truck selector
	var ts = _find(scene_root, "TruckSelect")
	if ts and ts is OptionButton:
		ts.clear()
		if player_trucks.is_empty():
			ts.add_item("No trucks in garage")
		else:
			for t in player_trucks:
				var on_road = t.get("activeRoute", null) != null
				var impounded = t.get("isImpounded", false)
				var suffix = " [ON ROAD]" if on_road else (" [IMPOUNDED]" if impounded else "")
				ts.add_item("%s — %s%s" % [t.get("model", "?"), t.get("vin", "?").left(8), suffix])
			# Auto-select first truck
			if player_trucks.size() > 0:
				selected_truck_id = player_trucks[0].get("id", "")
				_render_truck_blueprint(player_trucks[0])

func _on_truck_selected(idx: int) -> void:
	if idx < player_trucks.size():
		selected_truck_id = player_trucks[idx].get("id", "")
		_render_truck_blueprint(player_trucks[idx])

# ====================================================
# CATALOG RENDERING
# ====================================================
func _render_catalog(filter: String) -> void:
	var list = _find(scene_root, "CatalogList")
	if not list:
		return
	for c in list.get_children():
		c.queue_free()

	var items = CATALOG
	if filter != "ALL":
		items = CATALOG.filter(func(i): return i.category == filter)

	for item in items:
		var card = _make_catalog_card(item)
		list.add_child(card)

func _make_catalog_card(item: Dictionary) -> Control:
	var is_selected = selected_item.get("id", "") == item.id
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(390, 78)

	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.09, 0.14, 0.9) if is_selected else Color(0.08, 0.07, 0.11, 0.85)
	style.border_color = item.color if is_selected else Color(item.color.r * 0.4, item.color.g * 0.4, item.color.b * 0.4, 0.6)
	style.border_width_left = 3
	style.border_width_bottom = 1
	style.set_corner_radius_all(4)
	card.add_theme_stylebox_override("panel", style)

	var hbox = HBoxContainer.new()
	hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hbox.add_theme_constant_override("separation", 8)
	card.add_child(hbox)

	# Icon
	var icon_lbl = Label.new()
	icon_lbl.text = item.icon
	icon_lbl.add_theme_font_size_override("font_size", 28)
	icon_lbl.custom_minimum_size = Vector2(44, 0)
	icon_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hbox.add_child(icon_lbl)

	# Info VBox
	var vbox = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hbox.add_child(vbox)

	var name_lbl = Label.new()
	name_lbl.text = item.name
	name_lbl.add_theme_font_size_override("font_size", 13)
	name_lbl.add_theme_color_override("font_color", item.color)
	vbox.add_child(name_lbl)

	var effect_lbl = Label.new()
	effect_lbl.text = item.stat_effect
	effect_lbl.add_theme_font_size_override("font_size", 11)
	effect_lbl.add_theme_color_override("font_color", Color(0.65, 0.6, 0.75, 1.0))
	vbox.add_child(effect_lbl)

	var cost_lbl = Label.new()
	var cur_icon = "💵" if item.currency == "LEGAL" else "💜"
	cost_lbl.text = "%s $%s  ·  %s" % [cur_icon, _fmt(item.cost), item.category]
	cost_lbl.add_theme_font_size_override("font_size", 11)
	cost_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 0.9))
	vbox.add_child(cost_lbl)

	# Select button
	var sel_btn = Button.new()
	sel_btn.text = "▶"
	sel_btn.custom_minimum_size = Vector2(32, 0)
	sel_btn.add_theme_color_override("font_color", item.color)
	sel_btn.pressed.connect(func(): _select_item(item))
	hbox.add_child(sel_btn)

	return card

# ====================================================
# ITEM DETAIL PANEL
# ====================================================
func _render_detail_placeholder() -> void:
	var panel = _find(scene_root, "DetailPanel")
	if not panel:
		return
	for c in panel.get_children():
		c.queue_free()

	var lbl = Label.new()
	lbl.text = "◀  SELECT AN ITEM\nFROM THE CATALOG\nTO VIEW DETAILS"
	lbl.add_theme_font_size_override("font_size", 16)
	lbl.add_theme_color_override("font_color", Color(0.3, 0.27, 0.4, 1.0))
	lbl.position = Vector2(60, 190)
	lbl.size = Vector2(310, 120)
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	panel.add_child(lbl)

func _select_item(item: Dictionary) -> void:
	selected_item = item
	_render_catalog("ALL") # refresh to show highlight
	_refresh_active_truck_blueprint()
	_render_item_detail(item)

func _refresh_active_truck_blueprint() -> void:
	for t in player_trucks:
		if t.get("id", "") == selected_truck_id:
			_render_truck_blueprint(t)
			break

func _get_highlight_for_item_id(item_id: String) -> String:
	match item_id:
		"engine_kit": return "ENGINE"
		"tires_set": return "TIRES"
		"false_bottom": return "FUEL_TANK"
		"chassis_cavity": return "CHASSIS"
		"shielding_lvl": return "SHIELDING"
		"tacho_spoofer": return "TACHO"
	return ""

func _render_item_detail(item: Dictionary) -> void:
	var panel = _find(scene_root, "DetailPanel")
	if not panel:
		return
	for c in panel.get_children():
		c.queue_free()

	# Title
	var icon_lbl = Label.new()
	icon_lbl.text = item.icon
	icon_lbl.add_theme_font_size_override("font_size", 52)
	icon_lbl.position = Vector2(160, 16)
	panel.add_child(icon_lbl)

	var title = Label.new()
	title.text = item.name
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", item.color)
	title.position = Vector2(14, 82)
	title.size = Vector2(402, 44)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	panel.add_child(title)

	var cat_lbl = Label.new()
	cat_lbl.text = item.category + "  ITEM"
	cat_lbl.add_theme_font_size_override("font_size", 11)
	cat_lbl.add_theme_color_override("font_color", Color(item.color.r * 0.6, item.color.g * 0.6, item.color.b * 0.6, 1.0))
	cat_lbl.position = Vector2(14, 126)
	panel.add_child(cat_lbl)

	# Divider
	var div = ColorRect.new()
	div.color = Color(item.color.r, item.color.g, item.color.b, 0.3)
	div.position = Vector2(14, 148)
	div.size = Vector2(402, 1)
	panel.add_child(div)

	# Description
	var desc = Label.new()
	desc.text = item.description
	desc.add_theme_font_size_override("font_size", 12)
	desc.add_theme_color_override("font_color", Color(0.72, 0.68, 0.78, 1.0))
	desc.position = Vector2(14, 160)
	desc.size = Vector2(402, 80)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	panel.add_child(desc)

	# Stat effect box
	var effect_bg = ColorRect.new()
	effect_bg.color = Color(item.color.r * 0.1, item.color.g * 0.1, item.color.b * 0.1, 0.8)
	effect_bg.position = Vector2(14, 250)
	effect_bg.size = Vector2(402, 36)
	panel.add_child(effect_bg)

	var effect_lbl = Label.new()
	effect_lbl.text = "EFFECT:  " + item.stat_effect
	effect_lbl.add_theme_font_size_override("font_size", 13)
	effect_lbl.add_theme_color_override("font_color", item.color)
	effect_lbl.position = Vector2(22, 258)
	panel.add_child(effect_lbl)

	# Cost display
	var cur_icon = "💵 LEGAL CASH" if item.currency == "LEGAL" else "💜 BLACK MARKET"
	var cur_bal = GameState.legal_balance if item.currency == "LEGAL" else GameState.black_market_balance
	var can_afford = cur_bal >= item.cost

	var cost_lbl = Label.new()
	cost_lbl.text = "COST:  $%s  (%s)" % [_fmt(item.cost), cur_icon]
	cost_lbl.add_theme_font_size_override("font_size", 14)
	cost_lbl.add_theme_color_override("font_color", Color(0.3, 1.0, 0.5, 1.0) if can_afford else Color(1.0, 0.35, 0.35, 1.0))
	cost_lbl.position = Vector2(14, 302)
	panel.add_child(cost_lbl)

	var balance_lbl = Label.new()
	balance_lbl.text = "Your balance: $%s" % _fmt(int(cur_bal))
	balance_lbl.add_theme_font_size_override("font_size", 11)
	balance_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 0.9))
	balance_lbl.position = Vector2(14, 326)
	panel.add_child(balance_lbl)

	# Warnings
	if item.category == "RIGGING":
		var warn = Label.new()
		warn.text = "⚠ ILLEGAL MODIFICATION — Police confiscation risk if discovered during deep scan inspection."
		warn.add_theme_font_size_override("font_size", 10)
		warn.add_theme_color_override("font_color", Color(1.0, 0.4, 0.2, 0.85))
		warn.position = Vector2(14, 358)
		warn.size = Vector2(402, 36)
		warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		panel.add_child(warn)

	if item.id == "tacho_spoofer":
		var tw = Label.new()
		tw.text = "☢ EXTREME RISK: Discovered tacho spoof during customs deep scan = immediate full seizure + Class C penalty levels."
		tw.add_theme_font_size_override("font_size", 10)
		tw.add_theme_color_override("font_color", Color(1.0, 0.2, 0.2, 0.9))
		tw.position = Vector2(14, 398)
		tw.size = Vector2(402, 44)
		tw.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		panel.add_child(tw)

	# BUY BUTTON
	var buy_btn = Button.new()
	buy_btn.position = Vector2(14, 462)
	buy_btn.size = Vector2(402, 50)
	buy_btn.add_theme_font_size_override("font_size", 16)
	if can_afford and not selected_truck_id.is_empty():
		buy_btn.text = "✔  PURCHASE & INSTALL  —  $%s" % _fmt(item.cost)
		buy_btn.add_theme_color_override("font_color", item.color)
		buy_btn.pressed.connect(_purchase_item)
	elif not can_afford:
		buy_btn.text = "✕  INSUFFICIENT FUNDS"
		buy_btn.add_theme_color_override("font_color", Color(0.5, 0.3, 0.3, 1.0))
		buy_btn.disabled = true
	else:
		buy_btn.text = "⚠  SELECT A TRUCK FIRST"
		buy_btn.add_theme_color_override("font_color", Color(0.6, 0.5, 0.2, 1.0))
		buy_btn.disabled = true
	panel.add_child(buy_btn)

# ====================================================
# TRUCK BLUEPRINT PANEL (RIGHT)
# ====================================================
func _render_truck_panel_empty() -> void:
	var panel = _find(scene_root, "TruckPanel")
	if not panel:
		return
	for c in panel.get_children():
		c.queue_free()
	var lbl = Label.new()
	lbl.text = "🚛\n\nSELECT A TRUCK\nTO VIEW HEALTH\n& INSTALLED MODS"
	lbl.add_theme_font_size_override("font_size", 14)
	lbl.add_theme_color_override("font_color", Color(0.3, 0.27, 0.4, 1.0))
	lbl.position = Vector2(60, 160)
	lbl.size = Vector2(270, 180)
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	panel.add_child(lbl)

func _render_truck_blueprint(truck: Dictionary) -> void:
	var panel = _find(scene_root, "TruckPanel")
	if not panel:
		return
	for c in panel.get_children():
		c.queue_free()

	# Truck model header
	var model_lbl = Label.new()
	model_lbl.text = "🚛  " + truck.get("model", "Unknown")
	model_lbl.add_theme_font_size_override("font_size", 15)
	model_lbl.add_theme_color_override("font_color", Color(0.85, 0.75, 1.0, 1.0))
	model_lbl.position = Vector2(14, 12)
	panel.add_child(model_lbl)

	var vin_lbl = Label.new()
	vin_lbl.text = "VIN: " + truck.get("vin", "—")
	vin_lbl.add_theme_font_size_override("font_size", 10)
	vin_lbl.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5, 1.0))
	vin_lbl.position = Vector2(14, 34)
	panel.add_child(vin_lbl)

	var div = ColorRect.new()
	div.color = Color(0.25, 0.2, 0.35, 0.5)
	div.position = Vector2(14, 54)
	div.size = Vector2(362, 1)
	panel.add_child(div)

	# Dynamic Programmatic Vector Blueprint
	var blueprint = VehicleBlueprint.new()
	blueprint.manufacturer = truck.get("manufacturer", "SCARFIA")
	blueprint.cab_type = truck.get("cabType", "STANDARD")
	blueprint.payload_type = truck.get("payloadType", "DRY")
	blueprint.tuning_tier = truck.get("tuningTier", "STOCK")
	blueprint.health_pct = int(truck.get("engineHealth", 100))
	blueprint.custom_minimum_size = Vector2(362, 100)
	blueprint.position = Vector2(14, 62)
	
	# Highlight selected upgrade part if matching
	if selected_item and selected_item.has("id"):
		blueprint.highlighted_part = _get_highlight_for_item_id(selected_item.get("id", ""))
		
	panel.add_child(blueprint)

	# HEALTH BARS
	var y = 170
	var stats = [
		["ENGINE HEALTH", truck.get("engineHealth", 0), Color(0.2, 0.85, 0.45, 1.0)],
		["TIRE WEAR", truck.get("tireWear", 0), Color(0.2, 0.7, 1.0, 1.0)],
	]

	for stat in stats:
		var s_lbl = Label.new()
		s_lbl.text = stat[0]
		s_lbl.add_theme_font_size_override("font_size", 11)
		s_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.65, 1.0))
		s_lbl.position = Vector2(14, y)
		panel.add_child(s_lbl)

		var pct_lbl = Label.new()
		pct_lbl.text = "%d%%" % stat[1]
		pct_lbl.add_theme_font_size_override("font_size", 11)
		var val = int(stat[1])
		pct_lbl.add_theme_color_override("font_color",
			Color(1.0, 0.2, 0.2, 1.0) if val < 20 else (Color(1.0, 0.65, 0.1, 1.0) if val < 50 else stat[2])
		)
		pct_lbl.position = Vector2(330, y)
		panel.add_child(pct_lbl)

		y += 18
		var bar_bg = ColorRect.new()
		bar_bg.color = Color(0.1, 0.1, 0.15, 0.9)
		bar_bg.position = Vector2(14, y)
		bar_bg.size = Vector2(362, 14)
		panel.add_child(bar_bg)

		var fill_pct = clamp(float(stat[1]) / 100.0, 0.0, 1.0)
		var bar_fill = ColorRect.new()
		bar_fill.color = (
			Color(0.9, 0.15, 0.15, 1.0) if fill_pct < 0.2 else
			(Color(0.95, 0.6, 0.1, 1.0) if fill_pct < 0.5 else stat[2])
		)
		bar_fill.position = Vector2(14, y)
		bar_fill.size = Vector2(362 * fill_pct, 14)
		panel.add_child(bar_fill)
		y += 26

	# MILEAGE
	var mi_lbl = Label.new()
	mi_lbl.text = "MILEAGE:  %.0f km" % truck.get("mileage", 0.0)
	mi_lbl.add_theme_font_size_override("font_size", 12)
	mi_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7, 1.0))
	mi_lbl.position = Vector2(14, y + 8)
	panel.add_child(mi_lbl)

	y += 30

	# INSTALLED MODS SECTION
	var mods_lbl = Label.new()
	mods_lbl.text = "INSTALLED MODS:"
	mods_lbl.add_theme_font_size_override("font_size", 11)
	mods_lbl.add_theme_color_override("font_color", Color(0.55, 0.35, 0.8, 1.0))
	mods_lbl.position = Vector2(14, y + 10)
	panel.add_child(mods_lbl)

	y += 28
	var mod_lines = []
	var ftm = truck.get("fuelTankMod", "STOCK")
	var shielding = truck.get("scannerShielding", 0)
	match ftm:
		"FALSE_BOTTOM": mod_lines.append("🛢 False-Bottom Fuel Tank  [ACTIVE]")
		"CHASSIS_CAVITY": mod_lines.append("🔩 Chassis Cavity Stash  [ACTIVE]")
		_: mod_lines.append("⬜ No Concealment Mod  [STOCK]")
	mod_lines.append("🛡 Lead Shielding: Level %d / 5" % shielding)

	for line in mod_lines:
		var ml = Label.new()
		ml.text = line
		ml.add_theme_font_size_override("font_size", 12)
		ml.add_theme_color_override("font_color",
			Color(0.8, 0.4, 1.0, 1.0) if "ACTIVE" in line else Color(0.45, 0.45, 0.55, 0.8)
		)
		ml.position = Vector2(14, y)
		panel.add_child(ml)
		y += 20

	# Impound warning
	if truck.get("isImpounded", false):
		var imp_lbl = Label.new()
		imp_lbl.text = "🚫 IMPOUNDED — Cannot install parts\nRelease date: " + str(truck.get("impoundReleaseAt", "unknown"))
		imp_lbl.add_theme_font_size_override("font_size", 11)
		imp_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
		imp_lbl.position = Vector2(14, 496)
		imp_lbl.size = Vector2(362, 44)
		imp_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		panel.add_child(imp_lbl)

	# Emergency repair shortcut
	var repair_btn = Button.new()
	repair_btn.text = "🔧  EMERGENCY REPAIR ESTIMATE"
	repair_btn.position = Vector2(14, 514)
	repair_btn.size = Vector2(362, 28)
	repair_btn.add_theme_font_size_override("font_size", 11)
	repair_btn.add_theme_color_override("font_color", Color(1.0, 0.7, 0.2, 1.0))
	repair_btn.pressed.connect(func(): _request_repair_estimate(truck.get("id", "")))
	panel.add_child(repair_btn)

# ====================================================
# PURCHASE
# ====================================================
func _purchase_item() -> void:
	if selected_item.is_empty() or selected_truck_id.is_empty():
		_show_toast("Select a truck and an item first.", Color(1.0, 0.6, 0.1, 1.0))
		return

	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "truckId": selected_truck_id, "partId": selected_item.id })

	buy_http.request(BASE_URL + "/api/shop/buy", headers, HTTPClient.METHOD_POST, body)
	buy_http.request_completed.connect(_on_purchase_response, CONNECT_ONE_SHOT)
	_show_toast("Processing purchase...", Color(0.7, 0.6, 0.9, 1.0))

func _on_purchase_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		_show_toast("✔ " + selected_item.name + " installed successfully!", Color(0.2, 1.0, 0.5, 1.0))
		UIEffects.play_success()
		# Refresh truck display with updated data
		if parsed and parsed.has("truck"):
			_render_truck_blueprint(parsed.truck)
		# Refresh balance
		_fetch_fleet()
		selected_item = {}
		_render_detail_placeholder()
	else:
		var err = parsed.get("error", "UNKNOWN") if parsed else "PARSE_ERROR"
		var msg_map = {
			"TRUCK_IMPOUNDED": "Cannot install parts on an impounded truck.",
			"TRUCK_ON_ROAD": "Recall the truck before installing parts.",
			"INSUFFICIENT_LEGAL_CASH": "Not enough legal cash.",
			"INSUFFICIENT_BLACK_MARKET_CASH": "Not enough black market funds.",
			"MAX_SHIELDING": "Already at max shielding level (5).",
		}
		_show_toast("✕ " + msg_map.get(err, err), Color(1.0, 0.3, 0.3, 1.0))
		UIEffects.play_error()

# ====================================================
# REPAIR ESTIMATE POPUP
# ====================================================
func _request_repair_estimate(truck_id: String) -> void:
	if truck_id.is_empty():
		return
	var token = GameState.auth_token
	http.request(
		BASE_URL + "/api/breakdown/estimate/" + truck_id,
		["Authorization: Bearer " + token],
		HTTPClient.METHOD_GET
	)
	http.request_completed.connect(_on_estimate_response, CONNECT_ONE_SHOT)

func _on_estimate_response(_r, code, _h, body) -> void:
	if code != 200:
		return
	var d = JSON.parse_string(body.get_string_from_utf8())
	if not d:
		return
	_show_toast(
		"🔧 Repair Estimate — Engine: $%s  Tires: $%s  Tow: $%s  TOTAL: $%s  [%s]" % [
			_fmt(int(d.get("engineCost", 0))),
			_fmt(int(d.get("tireCost", 0))),
			_fmt(int(d.get("towCost", 0))),
			_fmt(int(d.get("totalCost", 0))),
			d.get("severity", "?"),
		],
		Color(1.0, 0.75, 0.2, 1.0),
		5.0
	)

# ====================================================
# HELPERS
# ====================================================
func _go_back() -> void:
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _show_toast(msg: String, color: Color = Color(1.0, 0.85, 0.2, 1.0), duration: float = 3.0) -> void:
	var t = Label.new()
	t.text = msg
	t.add_theme_font_size_override("font_size", 13)
	t.add_theme_color_override("font_color", color)
	t.position = Vector2(80, 644)
	t.size = Vector2(1120, 28)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	scene_root.add_child(t)
	var tw = create_tween()
	tw.tween_interval(duration - 1.0)
	tw.tween_property(t, "modulate:a", 0.0, 1.0)
	tw.tween_callback(t.queue_free)

func _panel(pos: Vector2, sz: Vector2, col: Color, b_col: Color = Color(0.2, 0.9, 0.7, 0.25)) -> PanelContainer:
	var p = PanelContainer.new()
	p.position = pos
	p.size = sz
	var s = StyleBoxFlat.new()
	var alpha_col = col
	alpha_col.a = 0.85 # Sleek translucent glassmorphism
	s.bg_color = alpha_col
	s.border_color = b_col
	s.border_width_bottom = 1; s.border_width_top = 1
	s.border_width_left = 1; s.border_width_right = 1
	s.set_corner_radius_all(6)
	p.add_theme_stylebox_override("panel", s)
	return p

func _btn(txt: String, pos: Vector2, sz: Vector2) -> Button:
	var b = Button.new()
	b.text = txt; b.position = pos; b.size = sz
	b.add_theme_font_size_override("font_size", 11)
	b.add_theme_color_override("font_color", Color(0.75, 0.65, 0.9, 1.0))
	return b

func _fmt(n: int) -> String:
	if n >= 1000000: return "%.1fM" % (float(n) / 1000000.0)
	if n >= 1000: return "%.1fK" % (float(n) / 1000.0)
	return str(n)

func _find(root: Node, name: String) -> Node:
	if root.name == name: return root
	for c in root.get_children():
		var r = _find(c, name)
		if r: return r
	return null
