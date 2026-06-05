extends Control

# ====================================================
# Showroom.gd — Factory Dealership and Vehicle Customization Showroom
# Programmatic premium UI layout with sleek glassmorphism and real-time invoice calculations
# ====================================================

var BASE_URL: String:
	get: return NetworkManager.HTTP_URL + "/dealership"

# Catalog & State Data
var catalog_models: Array = []
var custom_specs: Dictionary = {}
var player_garages: Array = []
var is_offline_mode: bool = false

# Selected Configuration State
var selected_model_idx: int = 0
var selected_tier_idx: int = 0

var selected_cab_type: String = "STANDARD"
var selected_payload_type: String = "DRY"
var selected_tuning_tier: String = "STOCK"
var selected_garage_id: String = ""

# Active Partnership Sponsor (cached from company profile)
var active_partnership: String = "NONE"

# HTTP Nodes
@onready var scene_root = $CanvasLayer
@onready var cat_http = $CatalogHTTPRequest
@onready var gar_http = $GaragesHTTPRequest
@onready var buy_http = $BuyHTTPRequest

func _ready() -> void:
	# Programmatically connect HTTP signals to response callbacks to ensure reliability
	cat_http.request_completed.connect(_on_catalog_response)
	gar_http.request_completed.connect(_on_garages_response)
	buy_http.request_completed.connect(_on_buy_response)
	
	_build_ui()
	_fetch_showroom_data()
	
	GameState.balance_updated.connect(_on_balance_sync)

func _fetch_showroom_data() -> void:
	var token = GameState.auth_token
	if token.is_empty():
		_show_toast("✕ AUTHENTICATION ERROR", Color(1.0, 0.25, 0.25))
		return
	
	# Fetch catalog
	cat_http.request(BASE_URL + "/catalog", ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)
	
	# Fetch garages
	gar_http.request(NetworkManager.HTTP_URL + "/garage", ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)

func _on_catalog_response(_r, code, _h, body) -> void:
	var success = false
	if code == 200:
		var d = JSON.parse_string(body.get_string_from_utf8())
		if d:
			catalog_models = d.get("models", [])
			custom_specs = d.get("customizationSpecs", {})
			if catalog_models.size() > 0:
				success = true
	
	if not success:
		is_offline_mode = true
		_generate_synthetic_catalog()
		_show_toast("ℹ Displaying offline showroom catalog", Color(0.2, 0.9, 0.7))
		
	_render_catalog_list()
	_update_customizer_panel()

func _on_garages_response(_r, code, _h, body) -> void:
	var success = false
	if code == 200:
		var d = JSON.parse_string(body.get_string_from_utf8())
		if d and d is Array:
			player_garages = d
			if player_garages.size() > 0:
				success = true
				if selected_garage_id.is_empty():
					selected_garage_id = player_garages[0].id
	
	if not success:
		_generate_synthetic_garages()
		
	_render_garage_selector()
	_update_customizer_panel()

func _on_buy_response(_r, code, _h, body) -> void:
	if code == 201:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		var msg = parsed.get("message", "Purchase complete!")
		_show_toast("✔ " + msg, Color(0.2, 0.9, 0.45), 5.0)
		
		if parsed.has("cost"):
			var cost = float(parsed.cost)
			GameState.legal_balance -= cost
			GameState.balance_updated.emit(GameState.legal_balance, GameState.black_market_balance)
		
		# Refresh garages to update capacities
		_fetch_showroom_data()
	else:
		if is_offline_mode:
			_simulate_offline_purchase()
		else:
			var parsed = JSON.parse_string(body.get_string_from_utf8())
			var err_msg = parsed.get("message", "Purchase rejected.") if parsed else "Server trade error."
			_show_toast("✕ Purchase Rejected: " + err_msg, Color(1.0, 0.25, 0.25), 4.0)

func _on_balance_sync(_l, _b) -> void:
	_update_balances_strip()
	_update_customizer_panel()

# ====================================================
# PROGRAMMATIC UI SYSTEM
# ====================================================
func _build_ui() -> void:
	# Programmatic High-Fidelity Animated HUD Background
	var bg = CyberGridBackground.new()
	scene_root.add_child(bg)
	
	# 1. HEADER (y=0)
	var hdr = _panel(Vector2(0, 0), Vector2(1280, 60), Color(0.04, 0.05, 0.08, 0.95), Color(0.2, 0.9, 0.7, 0.35))
	scene_root.add_child(hdr)

	var title = Label.new()
	title.text = "🏢  LOGISTIXPERT FACTORY DEALERSHIP SHOWROOM  —  FLEET CONTRACTING"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7, 1.0))
	title.position = Vector2(24, 18)
	hdr.add_child(title)

	var back_btn = _btn("◀  MAP HUD", Vector2(1150, 11), Vector2(106, 38))
	back_btn.pressed.connect(_go_back)
	back_btn.add_theme_color_override("font_color", Color(0.9, 0.3, 0.3, 1.0))
	hdr.add_child(back_btn)

	# 2. STATUS STRIP (y=60)
	var bar = _panel(Vector2(0, 60), Vector2(1280, 42), Color(0.04, 0.04, 0.06, 0.92), Color(0.2, 0.9, 0.7, 0.2))
	bar.name = "StatusStrip"
	scene_root.add_child(bar)
	
	var bal_lbl = Label.new()
	bal_lbl.text = "💵 Clean Cash: $0.00   ·   📜 Active Endorsement Sponsor: None"
	bal_lbl.add_theme_font_size_override("font_size", 12)
	bal_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 1.0))
	bal_lbl.position = Vector2(24, 11)
	bal_lbl.name = "StatusStripLabel"
	bar.add_child(bal_lbl)

	# 3. SPLIT WORKSPACE PANELS (y=112)
	# Left: Catalog Showcase (Width: 440)
	var left_hdr = Label.new()
	left_hdr.text = "FACTORY CATALOGUE MODELS"
	left_hdr.add_theme_font_size_override("font_size", 12)
	left_hdr.add_theme_color_override("font_color", Color(0.55, 0.75, 0.95))
	left_hdr.position = Vector2(24, 114)
	scene_root.add_child(left_hdr)

	# Left Catalog Panel container for glassmorphic borders
	var cat_panel = _panel(Vector2(24, 138), Vector2(420, 560), Color(0.04, 0.04, 0.07, 0.85), Color(0.65, 0.45, 1.0, 0.3))
	cat_panel.name = "CatalogPanel"
	scene_root.add_child(cat_panel)

	var catalog_scroll = ScrollContainer.new()
	catalog_scroll.position = Vector2(8, 8)
	catalog_scroll.size = Vector2(404, 544)
	catalog_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	catalog_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	catalog_scroll.name = "CatalogScroll"
	cat_panel.add_child(catalog_scroll)

	var catalog_vbox = VBoxContainer.new()
	catalog_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	catalog_vbox.add_theme_constant_override("separation", 12)
	catalog_vbox.name = "CatalogVBox"
	catalog_scroll.add_child(catalog_vbox)

	# Right: Customizer Workspace & Surcharge Calculator (Width: 780, pos_x: 476)
	var right_hdr = Label.new()
	right_hdr.text = "VEHICLE CONFIGURATOR AND FLEET SHIPPING SPECIFICATIONS"
	right_hdr.add_theme_font_size_override("font_size", 12)
	right_hdr.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
	right_hdr.position = Vector2(476, 114)
	scene_root.add_child(right_hdr)

	var customizer_panel = _panel(Vector2(476, 138), Vector2(780, 560), Color(0.04, 0.04, 0.07, 0.85), Color(0.2, 0.9, 0.7, 0.35))
	customizer_panel.name = "CustomizerPanel"
	scene_root.add_child(customizer_panel)

func _update_balances_strip() -> void:
	var label = _find(scene_root, "StatusStripLabel")
	if label and label is Label:
		var clean = GameState.legal_balance
		
		# Check brand partnership contract from cache or call GET
		var partner = active_partnership
		if partner == "NONE" and GameState.username != "":
			# Quick fallback default matching GameState or let render_brand fetch it
			pass
		
		var partner_txt = partner
		if partner_txt == "NONE":
			partner_txt = "None (No discount applied)"
		else:
			partner_txt = "%s Contract Endorsed (15%% Discount active!)" % partner_txt
			
		label.text = "💵 Clean Cash Balance: $%s   ·   📜 Active R&D Sponsor Contract: %s" % [
			String.num(clean, 2), partner_txt
		]

func _render_catalog_list() -> void:
	var catalog_vbox = _find(scene_root, "CatalogVBox")
	if not catalog_vbox: return
	
	# Clear previous cards
	for c in catalog_vbox.get_children():
		c.queue_free()

	for idx in range(catalog_models.size()):
		var model = catalog_models[idx]
		var brand = model.get("manufacturer", "Unknown")
		var representation = model.get("brandRepresentation", "")
		var desc = model.get("description", "")
		var tiers = model.get("tiers", [])
		
		# Card background - selected gets glowing cyan border, unselected gets underworld purple
		var is_selected = (selected_model_idx == idx)
		var border_col = Color(0.2, 0.9, 0.7, 0.8) if is_selected else Color(0.65, 0.45, 1.0, 0.25)
		var card = _panel(Vector2.ZERO, Vector2(396, 110), Color(0.07, 0.07, 0.11, 0.92), border_col)
		card.custom_minimum_size = Vector2(396, 110)
		catalog_vbox.add_child(card)

		if is_selected:
			var style_sel = card.get_theme_stylebox("panel") as StyleBoxFlat
			if style_sel:
				style_sel.border_width_left = 3

		var card_btn = Button.new()
		card_btn.flat = true
		card_btn.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		card_btn.pressed.connect(func(): _select_model(idx))
		card.add_child(card_btn)

		var v = VBoxContainer.new()
		v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		v.add_theme_constant_override("separation", 4)
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(v)
		
		# Spacer margin
		var sm = Control.new()
		sm.custom_minimum_size = Vector2(0, 4)
		v.add_child(sm)

		var title_lbl = Label.new()
		title_lbl.text = "🚛  %s  —  %s" % [brand.to_upper(), representation.to_upper()]
		title_lbl.add_theme_font_size_override("font_size", 12)
		
		# Highlight matched brand partnership
		if active_partnership.to_upper() == brand.to_upper():
			title_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45))
			title_lbl.text += " [SPONSOR]"
		else:
			title_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
		v.add_child(title_lbl)

		var desc_lbl = Label.new()
		desc_lbl.text = desc
		desc_lbl.add_theme_font_size_override("font_size", 9)
		desc_lbl.add_theme_color_override("font_color", Color(0.65, 0.65, 0.75, 0.85))
		desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc_lbl.custom_minimum_size = Vector2(360, 40)
		v.add_child(desc_lbl)

		# Core starting pricing
		var lowest_price = int(tiers[0].get("price", 0)) if tiers.size() > 0 else 0
		var price_lbl = Label.new()
		price_lbl.text = "Acquisition starting from: $%s Clean Cash" % _fmt(lowest_price)
		price_lbl.add_theme_font_size_override("font_size", 10)
		price_lbl.add_theme_color_override("font_color", Color(1.0, 0.8, 0.2, 0.9))
		v.add_child(price_lbl)

func _select_model(idx: int) -> void:
	selected_model_idx = idx
	selected_tier_idx = 0 # reset tier selector
	_render_catalog_list()
	_update_customizer_panel()

func _render_garage_selector() -> void:
	# Will be rendered dynamically inside the customizer workspace
	pass

# ====================================================
# CONFIGURATOR LOGIC & INVOICE RENDER
# ====================================================
func _update_customizer_panel() -> void:
	var customizer = _find(scene_root, "CustomizerPanel")
	if not customizer: return

	# Clear previous workspace
	for child in customizer.get_children():
		child.queue_free()

	if catalog_models.size() == 0: return

	var model = catalog_models[selected_model_idx]
	var brand = model.get("manufacturer", "Unknown")
	var representation = model.get("brandRepresentation", "")
	var tiers = model.get("tiers", [])

	var workspace_vbox = VBoxContainer.new()
	workspace_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	workspace_vbox.add_theme_constant_override("separation", 14)
	customizer.add_child(workspace_vbox)

	# Inner spacer
	var sc = Control.new()
	sc.custom_minimum_size = Vector2(0, 4)
	workspace_vbox.add_child(sc)

	# 1. Selected Model Showcase Header
	var showcase_hbox = HBoxContainer.new()
	showcase_hbox.add_theme_constant_override("separation", 16)
	workspace_vbox.add_child(showcase_hbox)

	var header_vbox = VBoxContainer.new()
	header_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	showcase_hbox.add_child(header_vbox)

	var main_title = Label.new()
	main_title.text = "⚡ CONFIGURING: %s %s" % [brand.to_upper(), tiers[selected_tier_idx].get("name", "").replace("_", " ")]
	main_title.add_theme_font_size_override("font_size", 15)
	main_title.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7, 1.0))
	header_vbox.add_child(main_title)

	var sub_lbl = Label.new()
	sub_lbl.text = "Representing high-fidelity mock: %s" % representation
	sub_lbl.add_theme_font_size_override("font_size", 10)
	sub_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.65))
	header_vbox.add_child(sub_lbl)

	# 1.5. Dynamic Programmatic Vector Blueprint
	var blueprint = VehicleBlueprint.new()
	blueprint.manufacturer = brand
	blueprint.cab_type = selected_cab_type
	blueprint.payload_type = selected_payload_type
	blueprint.tuning_tier = selected_tuning_tier
	blueprint.custom_minimum_size = Vector2(744, 150) # Compact height inside customizer
	workspace_vbox.add_child(blueprint)

	# 2. Selectable Tiers (Chassis weights)
	var tier_box = HBoxContainer.new()
	tier_box.add_theme_constant_override("separation", 8)
	workspace_vbox.add_child(tier_box)

	var t_lbl = Label.new()
	t_lbl.text = "CHASSIS TIER: "
	t_lbl.add_theme_font_size_override("font_size", 11)
	t_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.9))
	t_lbl.custom_minimum_size = Vector2(100, 0)
	tier_box.add_child(t_lbl)

	for t_idx in range(tiers.size()):
		var tier_obj = tiers[t_idx]
		var tier_name = tier_obj.get("name", "")
		var tier_price = int(tier_obj.get("price", 0))
		
		var t_btn = Button.new()
		t_btn.text = "%s ($%s)" % [tier_name.replace("_", " "), _fmt(tier_price)]
		t_btn.custom_minimum_size = Vector2(110, 36)
		t_btn.add_theme_font_size_override("font_size", 10)
		
		var is_sel = (selected_tier_idx == t_idx)
		_style_customizer_btn(t_btn, is_sel, Color(0.2, 0.9, 0.7))
		
		if is_sel:
			t_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7, 1.0))
		else:
			t_btn.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 0.7))
			t_btn.pressed.connect(func(): _select_tier(t_idx))
		
		tier_box.add_child(t_btn)

	# 3. Specification Customizers (Cab types, payloads, engine remaps)
	# Grid arrangement for specifications
	var grid = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 24)
	grid.add_theme_constant_override("v_separation", 14)
	workspace_vbox.add_child(grid)

	# A. CAB TYPE SELECTOR
	var cab_v = VBoxContainer.new()
	cab_v.add_theme_constant_override("separation", 4)
	grid.add_child(cab_v)

	var cab_lbl = Label.new()
	cab_lbl.text = "CAB TYPE SLEEPER SPECIFICATION"
	cab_lbl.add_theme_font_size_override("font_size", 11)
	cab_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	cab_v.add_child(cab_lbl)

	var cab_hbox = HBoxContainer.new()
	cab_hbox.add_theme_constant_override("separation", 6)
	cab_v.add_child(cab_hbox)

	var cab_specs = [
		["STANDARD", "+$0"],
		["EXTENDED", "+$8K"],
		["SUPER_LONG", "+$18K"],
		["LUXURY_SLEEPER", "+$28K"]
	]
	for spec in cab_specs:
		var c_btn = Button.new()
		c_btn.text = "%s\n(%s)" % [spec[0], spec[1]]
		c_btn.custom_minimum_size = Vector2(106, 42)
		c_btn.add_theme_font_size_override("font_size", 10)
		
		var is_sel = (selected_cab_type == spec[0])
		_style_customizer_btn(c_btn, is_sel, Color(0.2, 0.9, 0.7))
		
		if is_sel:
			c_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
		else:
			c_btn.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 0.7))
			c_btn.pressed.connect(func(): _select_cab(spec[0]))
		cab_hbox.add_child(c_btn)

	# B. TUNING SPECIFICATION
	var tune_v = VBoxContainer.new()
	tune_v.add_theme_constant_override("separation", 4)
	grid.add_child(tune_v)

	var tune_lbl = Label.new()
	tune_lbl.text = "ENGINE RE-MAPPING AND TURBO CHIPS"
	tune_lbl.add_theme_font_size_override("font_size", 11)
	tune_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	tune_v.add_child(tune_lbl)

	var tune_hbox = HBoxContainer.new()
	tune_hbox.add_theme_constant_override("separation", 6)
	tune_v.add_child(tune_hbox)

	var tune_specs = [
		["STOCK", "+$0"],
		["PERFORMANCE", "+$10K"],
		["ECONOMY", "+$7K"],
		["RELIABLE", "+$6K"]
	]
	for spec in tune_specs:
		var t_btn = Button.new()
		t_btn.text = "%s\n(%s)" % [spec[0], spec[1]]
		t_btn.custom_minimum_size = Vector2(80, 42)
		t_btn.add_theme_font_size_override("font_size", 9)
		
		var is_sel = (selected_tuning_tier == spec[0])
		_style_customizer_btn(t_btn, is_sel, Color(0.2, 0.9, 0.7))
		
		if is_sel:
			t_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
		else:
			t_btn.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 0.7))
			t_btn.pressed.connect(func(): _select_tuning(spec[0]))
		tune_hbox.add_child(t_btn)

	# C. PAYLOAD TYPE RIGS (Row spans both columns)
	var payload_v = VBoxContainer.new()
	payload_v.add_theme_constant_override("separation", 4)
	workspace_vbox.add_child(payload_v)

	var pay_lbl = Label.new()
	pay_lbl.text = "PAYLOAD CARGO RIGGING ARCHITECTURE"
	pay_lbl.add_theme_font_size_override("font_size", 11)
	pay_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	payload_v.add_child(pay_lbl)

	var pay_hbox = HBoxContainer.new()
	pay_hbox.add_theme_constant_override("separation", 6)
	payload_v.add_child(pay_hbox)

	var payload_specs = [
		["DRY", "+$0"],
		["REEFER", "+$12K"],
		["CONSTRUCTION", "+$0"],
		["AUTOMOTIVE", "+$0"],
		["HAZARDOUS", "+$22K"],
		["LOGGING", "+$0"],
		["ULTRA_HEAVY", "+$35K"]
	]
	for spec in payload_specs:
		var p_btn = Button.new()
		p_btn.text = "%s\n(%s)" % [spec[0], spec[1]]
		p_btn.custom_minimum_size = Vector2(98, 42)
		p_btn.add_theme_font_size_override("font_size", 9)
		
		var is_sel = (selected_payload_type == spec[0])
		_style_customizer_btn(p_btn, is_sel, Color(0.2, 0.9, 0.7))
		
		if is_sel:
			p_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
		else:
			p_btn.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 0.7))
			p_btn.pressed.connect(func(): _select_payload(spec[0]))
		pay_hbox.add_child(p_btn)

	# 4. Target Garage Selector
	var gar_v = VBoxContainer.new()
	gar_v.add_theme_constant_override("separation", 4)
	workspace_vbox.add_child(gar_v)

	var gar_title_lbl = Label.new()
	gar_title_lbl.text = "SELECT TARGET SHIPMENT TERMINAL SLOT"
	gar_title_lbl.add_theme_font_size_override("font_size", 11)
	gar_title_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	gar_v.add_child(gar_title_lbl)

	var gar_hbox = HBoxContainer.new()
	gar_hbox.add_theme_constant_override("separation", 10)
	gar_v.add_child(gar_hbox)

	if player_garages.size() == 0:
		var empty_lbl = Label.new()
		empty_lbl.text = "⚠ No owned terminals discovered! Expand corporate network first."
		empty_lbl.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
		empty_lbl.add_theme_font_size_override("font_size", 11)
		gar_hbox.add_child(empty_lbl)
	else:
		for gar in player_garages:
			var gar_id = gar.get("id", "")
			var city = gar.get("city", "Central Hub")
			var trucks = gar.get("trucks", [])
			var capacity = int(gar.get("capacity", 3))
			var slots_occupied = trucks.size()
			var slots_rem = capacity - slots_occupied
			
			var gar_btn = Button.new()
			gar_btn.text = "%s Terminal\n(%d / %d Slots)" % [city.to_upper(), slots_occupied, capacity]
			gar_btn.custom_minimum_size = Vector2(170, 42)
			gar_btn.add_theme_font_size_override("font_size", 10)
			
			var is_sel = (selected_garage_id == gar_id)
			_style_customizer_btn(gar_btn, is_sel, Color(0.2, 0.9, 0.7))
			
			if slots_rem <= 0:
				gar_btn.disabled = true
				gar_btn.add_theme_color_override("font_color", Color(0.65, 0.45, 0.45, 0.5))
			elif is_sel:
				gar_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
			else:
				gar_btn.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 0.7))
				gar_btn.pressed.connect(func(): _select_garage(gar_id))
			
			gar_hbox.add_child(gar_btn)

	# 5. Live Pricing Invoice Card & Purchase Button - themed with financial amber glow
	var invoice_card = _panel(Vector2.ZERO, Vector2(744, 114), Color(0.08, 0.08, 0.12, 0.98), Color(0.95, 0.7, 0.15, 0.35))
	invoice_card.custom_minimum_size = Vector2(744, 114)
	workspace_vbox.add_child(invoice_card)

	var invoice_hbox = HBoxContainer.new()
	invoice_hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	invoice_hbox.add_theme_constant_override("separation", 24)
	invoice_card.add_child(invoice_hbox)
	
	# Margin
	var sp_inv = Control.new()
	sp_inv.custom_minimum_size = Vector2(2, 0)
	invoice_hbox.add_child(sp_inv)

	# Calculations column
	var calc_vbox = VBoxContainer.new()
	calc_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	calc_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	invoice_hbox.add_child(calc_vbox)

	# Dynamic pricing computations
	var base_price = int(tiers[selected_tier_idx].get("price", 0))
	var surcharge = 0
	if selected_cab_type == "EXTENDED": surcharge += 8000
	if selected_cab_type == "SUPER_LONG": surcharge += 18000
	if selected_cab_type == "LUXURY_SLEEPER": surcharge += 28000
	if selected_payload_type == "REEFER": surcharge += 12000
	if selected_payload_type == "HAZARDOUS": surcharge += 22000
	if selected_payload_type == "ULTRA_HEAVY": surcharge += 35000
	if selected_tuning_tier == "PERFORMANCE": surcharge += 10000
	if selected_tuning_tier == "ECONOMY": surcharge += 7000
	if selected_tuning_tier == "RELIABLE": surcharge += 6000

	var subtotal = base_price + surcharge
	var partner_match = active_partnership.to_upper() == brand.to_upper()
	var final_cost = float(subtotal)
	if partner_match:
		final_cost *= 0.85 # 15% discount

	var agent_bonus = GameState.get_employee_bonus("purchasing_agent")
	final_cost = final_cost * (1.0 - (agent_bonus / 100.0))

	var retail_lbl = Label.new()
	retail_lbl.text = "Retail Base Price: $%s   ·   Customizations Surcharge: $%s" % [_fmt(base_price), _fmt(surcharge)]
	retail_lbl.add_theme_font_size_override("font_size", 10)
	retail_lbl.add_theme_color_override("font_color", Color(0.65, 0.65, 0.75))
	calc_vbox.add_child(retail_lbl)

	if agent_bonus != 0.0:
		var agent_lbl = Label.new()
		if agent_bonus > 0.0:
			agent_lbl.text = "👥 Purchasing Agent discount: -%s%% applied." % String.num(agent_bonus, 2)
			agent_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45))
		else:
			agent_lbl.text = "⚠️ Purchasing Agent penalty (Apprentice): +%s%% surcharge applied." % String.num(abs(agent_bonus), 2)
			agent_lbl.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4))
		agent_lbl.add_theme_font_size_override("font_size", 9.5)
		calc_vbox.add_child(agent_lbl)


	var promo_lbl = Label.new()
	if partner_match:
		promo_lbl.text = "✨ Matched Sponsor Endorsement Contract! Applying -15% reduction."
		promo_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45))
	else:
		promo_lbl.text = "No sponsor discounts active for %s. Cost matches default." % brand
		promo_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.65))
	promo_lbl.add_theme_font_size_override("font_size", 9.5)
	calc_vbox.add_child(promo_lbl)

	var invoice_total_lbl = Label.new()
	invoice_total_lbl.text = "TOTAL PURCHASE INVOICE: $%s Clean Cash" % String.num(final_cost, 2)
	invoice_total_lbl.add_theme_font_size_override("font_size", 13)
	invoice_total_lbl.add_theme_color_override("font_color", Color(1.0, 0.8, 0.2, 1.0))
	calc_vbox.add_child(invoice_total_lbl)

	# Purchase submit button column
	var buy_vbox = VBoxContainer.new()
	buy_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	buy_vbox.custom_minimum_size = Vector2(210, 0)
	invoice_hbox.add_child(buy_vbox)

	var acquire_btn = Button.new()
	acquire_btn.custom_minimum_size = Vector2(196, 46)
	acquire_btn.text = "ACQUIRE VEHICLE"
	acquire_btn.add_theme_font_size_override("font_size", 12)
	
	# Evaluate budget / slot validation
	var can_buy = true
	var reason = ""
	
	if selected_garage_id.is_empty():
		can_buy = false
		reason = "SELECT HUB"
	elif GameState.legal_balance < final_cost:
		can_buy = false
		reason = "INSUFFICIENT FUNDS"
		
	# Neon buy button style boxes
	var sb_buy_normal = StyleBoxFlat.new()
	var sb_buy_hover = StyleBoxFlat.new()
	var sb_buy_pressed = StyleBoxFlat.new()
	var sb_buy_disabled = StyleBoxFlat.new()
	
	if can_buy:
		sb_buy_normal.bg_color = Color(0.04, 0.22, 0.12, 0.75) # neon green backing
		sb_buy_normal.border_color = Color(0.2, 0.85, 0.45, 0.8)
		sb_buy_normal.set_border_width_all(2)
		
		sb_buy_hover.bg_color = Color(0.06, 0.3, 0.16, 0.85)
		sb_buy_hover.border_color = Color(0.2, 0.85, 0.45, 1.0)
		sb_buy_hover.set_border_width_all(2)
		
		sb_buy_pressed.bg_color = Color(0.1, 0.45, 0.24, 1.0)
		sb_buy_pressed.border_color = Color(0.2, 0.85, 0.45, 1.0)
		sb_buy_pressed.set_border_width_all(2)
	else:
		sb_buy_disabled.bg_color = Color(0.12, 0.05, 0.05, 0.5)
		sb_buy_disabled.border_color = Color(0.8, 0.25, 0.25, 0.3)
		sb_buy_disabled.set_border_width_all(1)
		
	for sb in [sb_buy_normal, sb_buy_hover, sb_buy_pressed, sb_buy_disabled]:
		sb.set_corner_radius_all(6)
		
	if can_buy:
		acquire_btn.add_theme_stylebox_override("normal", sb_buy_normal)
		acquire_btn.add_theme_stylebox_override("hover", sb_buy_hover)
		acquire_btn.add_theme_stylebox_override("pressed", sb_buy_pressed)
		acquire_btn.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45, 1.0))
		acquire_btn.pressed.connect(func(): _execute_purchase_trade(brand, tiers[selected_tier_idx].get("name", ""), final_cost))
	else:
		acquire_btn.disabled = true
		acquire_btn.text = reason
		acquire_btn.add_theme_stylebox_override("disabled", sb_buy_disabled)
		acquire_btn.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4, 0.65))
		
	buy_vbox.add_child(acquire_btn)

	var right_inv = Control.new()
	right_inv.custom_minimum_size = Vector2(4, 0)
	invoice_hbox.add_child(right_inv)

func _select_tier(idx: int) -> void:
	selected_tier_idx = idx
	_update_customizer_panel()

func _select_cab(cab: String) -> void:
	selected_cab_type = cab
	_update_customizer_panel()

func _select_tuning(tune: String) -> void:
	selected_tuning_tier = tune
	_update_customizer_panel()

func _select_payload(payload: String) -> void:
	selected_payload_type = payload
	_update_customizer_panel()

func _select_garage(gar_id: String) -> void:
	selected_garage_id = gar_id
	_update_customizer_panel()

# ====================================================
# NETWORK COMMANDS
# ====================================================
func _execute_purchase_trade(brand: String, tier_name: String, cost: float) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({
		"manufacturer": brand.to_upper(),
		"tier": tier_name,
		"cabType": selected_cab_type,
		"payloadType": selected_payload_type,
		"tuningTier": selected_tuning_tier,
		"garageId": selected_garage_id
	})
	
	buy_http.request(BASE_URL + "/buy", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Acquiring fleet vehicle, registering license plates...", Color(0.2, 0.9, 0.7, 1.0))

# ====================================================
# NAVIGATION & TOASTS
# ====================================================
func _go_back() -> void:
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _show_toast(msg: String, color: Color = Color(1.0, 0.85, 0.2, 1.0), duration: float = 3.0) -> void:
	var t = Label.new()
	t.text = msg
	t.add_theme_font_size_override("font_size", 13)
	t.add_theme_color_override("font_color", color)
	t.position = Vector2(80, 16)
	t.size = Vector2(1120, 28)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	scene_root.add_child(t)
	var tw = create_tween()
	tw.tween_interval(duration - 1.0)
	tw.tween_property(t, "modulate:a", 0.0, 1.0)
	tw.tween_callback(t.queue_free)

func _panel(pos: Vector2, sz: Vector2, col: Color, b_col: Color = Color(0.12, 0.16, 0.24, 0.6)) -> PanelContainer:
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
	b.add_theme_color_override("font_color", Color(0.95, 0.35, 0.35, 1.0))
	
	# Apply sleek crimson/red border flat styling for back buttons
	var sb_normal = StyleBoxFlat.new()
	sb_normal.bg_color = Color(0.12, 0.05, 0.05, 0.5)
	sb_normal.border_color = Color(0.95, 0.35, 0.35, 0.4)
	sb_normal.set_border_width_all(1)
	sb_normal.set_corner_radius_all(4)
	
	var sb_hover = StyleBoxFlat.new()
	sb_hover.bg_color = Color(0.18, 0.08, 0.08, 0.75)
	sb_hover.border_color = Color(0.95, 0.35, 0.35, 0.8)
	sb_hover.set_border_width_all(1)
	sb_hover.set_corner_radius_all(4)
	
	b.add_theme_stylebox_override("normal", sb_normal)
	b.add_theme_stylebox_override("hover", sb_hover)
	return b

func _style_customizer_btn(btn: Button, is_selected: bool, accent_col: Color = Color(0.2, 0.9, 0.7)) -> void:
	var sb_normal = StyleBoxFlat.new()
	var sb_hover = StyleBoxFlat.new()
	var sb_pressed = StyleBoxFlat.new()
	var sb_disabled = StyleBoxFlat.new()
	
	if is_selected:
		# Filled or glowing border
		sb_normal.bg_color = Color(accent_col.r * 0.15, accent_col.g * 0.15, accent_col.b * 0.15, 0.8)
		sb_normal.border_color = accent_col
		sb_normal.border_width_left = 2; sb_normal.border_width_bottom = 2
		sb_normal.border_width_right = 2; sb_normal.border_width_top = 2
		
		sb_hover.bg_color = Color(accent_col.r * 0.25, accent_col.g * 0.25, accent_col.b * 0.25, 0.9)
		sb_hover.border_color = accent_col
		sb_hover.border_width_left = 2; sb_hover.border_width_bottom = 2
		sb_hover.border_width_right = 2; sb_hover.border_width_top = 2
	else:
		# Dark background, subtle border
		sb_normal.bg_color = Color(0.06, 0.06, 0.08, 0.6)
		sb_normal.border_color = Color(0.15, 0.2, 0.28, 0.4)
		sb_normal.border_width_left = 1; sb_normal.border_width_bottom = 1
		sb_normal.border_width_right = 1; sb_normal.border_width_top = 1
		
		sb_hover.bg_color = Color(0.08, 0.09, 0.12, 0.8)
		sb_hover.border_color = Color(accent_col.r, accent_col.g, accent_col.b, 0.5)
		sb_hover.border_width_left = 1; sb_hover.border_width_bottom = 1
		sb_hover.border_width_right = 1; sb_hover.border_width_top = 1
		
	# Shared properties
	for sb in [sb_normal, sb_hover, sb_pressed]:
		sb.set_corner_radius_all(4)
		
	sb_pressed.bg_color = Color(accent_col.r * 0.3, accent_col.g * 0.3, accent_col.b * 0.3, 1.0)
	sb_pressed.border_color = accent_col
	sb_pressed.set_border_width_all(2)
	sb_pressed.set_corner_radius_all(4)
	
	sb_disabled.bg_color = Color(0.04, 0.04, 0.05, 0.3)
	sb_disabled.border_color = Color(0.1, 0.1, 0.12, 0.2)
	sb_disabled.set_border_width_all(1)
	sb_disabled.set_corner_radius_all(4)
	
	btn.add_theme_stylebox_override("normal", sb_normal)
	btn.add_theme_stylebox_override("hover", sb_hover)
	btn.add_theme_stylebox_override("pressed", sb_pressed)
	btn.add_theme_stylebox_override("disabled", sb_disabled)

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

func _generate_synthetic_catalog() -> void:
	catalog_models = [
		{
			"manufacturer": "TESIO",
			"brandRepresentation": "MODEL X ROAD-HAULER",
			"description": "Next-generation fully electric platform. Silent motors, high torque, integrated autopilot guidance. Fits premium sleeper cabs.",
			"tiers": [
				{"name": "E-HAULER_STANDARD", "price": 145000},
				{"name": "E-HAULER_PRO", "price": 195000},
				{"name": "E-HAULER_ULTRA", "price": 265000}
			]
		},
		{
			"manufacturer": "SCARFIA",
			"brandRepresentation": "S-SERIES LINEHAUL",
			"description": "The undisputed king of European long-distance freight. Maximum reliability, customizable specifications, premium cabin comfort.",
			"tiers": [
				{"name": "CHASSIS_4X2", "price": 110000},
				{"name": "CHASSIS_6X2", "price": 150000},
				{"name": "CHASSIS_8X4", "price": 210000}
			]
		},
		{
			"manufacturer": "MOOSE",
			"brandRepresentation": "NORTHERN TITAN",
			"description": "Swedish industrial workhorse built for extreme weather and heavy logging or construction payloads. Rugged chassis, reinforced axles.",
			"tiers": [
				{"name": "TITAN_STOCK", "price": 125000},
				{"name": "TITAN_REINFORCED", "price": 175000},
				{"name": "TITAN_HEAVY_DUTY", "price": 240000}
			]
		},
		{
			"manufacturer": "GUY",
			"brandRepresentation": "TGX PERFORMANCE",
			"description": "German precision engineering focusing on fuel economy, quiet ride, and highly efficient engine re-maps. Perfect for heavy cargo rigging.",
			"tiers": [
				{"name": "TGX_EFFICIENT", "price": 115000},
				{"name": "TGX_PREMIUM", "price": 160000},
				{"name": "TGX_FLAGSHIP", "price": 225000}
			]
		}
	]

func _generate_synthetic_garages() -> void:
	player_garages = [
		{
			"id": "syn_gar_minsk",
			"city": "Minsk",
			"capacity": 3,
			"trucks": []
		},
		{
			"id": "syn_gar_riga",
			"city": "Riga",
			"capacity": 5,
			"trucks": []
		}
	]
	if selected_garage_id.is_empty() and player_garages.size() > 0:
		selected_garage_id = player_garages[0].id

func _simulate_offline_purchase() -> void:
	var model = catalog_models[selected_model_idx]
	var brand = model.get("manufacturer", "Unknown")
	var tiers = model.get("tiers", [])
	var base_price = int(tiers[selected_tier_idx].get("price", 0))
	var surcharge = 0
	if selected_cab_type == "EXTENDED": surcharge += 8000
	if selected_cab_type == "SUPER_LONG": surcharge += 18000
	if selected_cab_type == "LUXURY_SLEEPER": surcharge += 28000
	if selected_payload_type == "REEFER": surcharge += 12000
	if selected_payload_type == "HAZARDOUS": surcharge += 22000
	if selected_payload_type == "ULTRA_HEAVY": surcharge += 35000
	if selected_tuning_tier == "PERFORMANCE": surcharge += 10000
	if selected_tuning_tier == "ECONOMY": surcharge += 7000
	if selected_tuning_tier == "RELIABLE": surcharge += 6000

	var subtotal = base_price + surcharge
	var partner_match = active_partnership.to_upper() == brand.to_upper()
	var final_cost = float(subtotal)
	if partner_match:
		final_cost *= 0.85

	GameState.legal_balance -= final_cost
	GameState.balance_updated.emit(GameState.legal_balance, GameState.black_market_balance)
	
	# Add the truck to player_garages locally
	for gar in player_garages:
		if gar.get("id") == selected_garage_id:
			var trucks = gar.get("trucks", [])
			var new_truck = {
				"id": "off_truck_" + str(Time.get_ticks_usec()),
				"model": brand.to_upper() + " " + tiers[selected_tier_idx].get("name", "").replace("_", " "),
				"engineHealth": 100,
				"tireWear": 0,
				"isImpounded": false,
				"driver": null
			}
			trucks.append(new_truck)
			gar["trucks"] = trucks
			break
			
	# Update local fleet list in GameState
	var merged_fleet: Array = []
	for g in player_garages:
		var trucks = g.get("trucks", [])
		for t in trucks:
			t["garageCity"] = g.get("city", "Unknown")
			merged_fleet.append(t)
	GameState.fleet = merged_fleet
	
	_show_toast("✔ [OFFLINE SIM] Purchase Complete! Vehicle registered in terminal.", Color(0.2, 0.9, 0.45), 5.0)
	_update_customizer_panel()
