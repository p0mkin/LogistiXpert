extends Control

# ====================================================
# TechTree.gd — Corporate R&D Laboratory and Brand Contracts Panel
# Programmatic high-fidelity UI layout with sleek dark-mode glassmorphism
# ====================================================

var BASE_URL: String:
	get: return NetworkManager.HTTP_URL + "/research"

# Active State Data
var company_data: Dictionary = {}
var research_nodes: Array = []
var active_partnership: String = "NONE"

var selected_brand: String = "SCARFIA"

@onready var scene_root = $CanvasLayer
@onready var get_http = $GetHTTPRequest
@onready var upgrade_http = $UpgradeHTTPRequest
@onready var brand_http = $BrandHTTPRequest

func _ready() -> void:
	_build_ui()
	_fetch_research_data()
	
	# Listen to balance/state updates
	GameState.balance_updated.connect(_on_balance_sync)

func _fetch_research_data() -> void:
	var token = GameState.auth_token
	if token.is_empty():
		_show_toast("✕ AUTHENTICATION ERROR", Color(1.0, 0.25, 0.25))
		return
	
	get_http.request(BASE_URL, ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)

func _on_get_response(_r, code, _h, body) -> void:
	if code == 200:
		var d = JSON.parse_string(body.get_string_from_utf8())
		if d:
			company_data = d
			research_nodes = d.get("nodes", [])
			active_partnership = d.get("brandPartnership", "NONE")
			_update_balances_strip()
			_render_research_nodes()
			_render_brand_contracts()
	else:
		_show_toast("✕ Error loading laboratory data", Color(1.0, 0.3, 0.3))

func _on_upgrade_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		var msg = parsed.get("message", "Upgrade complete!")
		_show_toast("✔ " + msg, Color(0.2, 0.9, 0.45), 4.0)
		
		# Synchronize local legal balance representation
		if parsed.has("legalBalance"):
			GameState.legal_balance = float(parsed.legalBalance)
			GameState.balance_updated.emit(GameState.legal_balance, GameState.black_market_balance)
			
		_fetch_research_data()
	else:
		var err_msg = parsed.get("message", "Upgrade failed.") if parsed else "Server transaction error."
		_show_toast("✕ Upgrade Rejected: " + err_msg, Color(1.0, 0.25, 0.25), 4.0)

func _on_brand_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		var msg = parsed.get("message", "Contract signed successfully!")
		_show_toast("✔ " + msg, Color(0.2, 0.9, 0.45), 5.0)
		
		if parsed.has("legalBalance"):
			GameState.legal_balance = float(parsed.legalBalance)
			GameState.balance_updated.emit(GameState.legal_balance, GameState.black_market_balance)
			
		_fetch_research_data()
	else:
		var err_msg = parsed.get("message", "Contract rejected.") if parsed else "Server contract error."
		_show_toast("✕ Contract Rejected: " + err_msg, Color(1.0, 0.25, 0.25), 4.0)

func _on_balance_sync(_l, _b) -> void:
	_update_balances_strip()

# ====================================================
# PROGRAMMATIC UI SYSTEM
# ====================================================
func _build_ui() -> void:
	# Programmatic High-Fidelity Cyber Grid Background
	var bg = CyberGridBackground.new()
	bg.primary_color = Color(0.65, 0.45, 1.0, 0.1) # Underworld Purple primary
	bg.accent_color = Color(0.2, 0.9, 0.7, 0.08)   # Cyber Cyan secondary
	scene_root.add_child(bg)
		
	# 1. HEADER (y=0)
	var hdr = _panel(Vector2(0, 0), Vector2(1280, 60), Color(0.06, 0.05, 0.09, 0.98), Color(0.65, 0.45, 1.0, 0.35))
	scene_root.add_child(hdr)

	var title = Label.new()
	title.text = "🔬  LOGISTIXPERT R&D LABORATORY  —  TECHNOLOGY DEVELOPMENT"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.65, 0.45, 1.0, 1.0))
	title.position = Vector2(24, 18)
	hdr.add_child(title)

	var back_btn = _btn("◀  MAP HUD", Vector2(1150, 11), Vector2(106, 38))
	back_btn.pressed.connect(_go_back)
	back_btn.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
	
	var sb_back_normal = StyleBoxFlat.new()
	sb_back_normal.bg_color = Color(0.12, 0.05, 0.05, 0.5)
	sb_back_normal.border_color = Color(1.0, 0.25, 0.25, 0.4)
	sb_back_normal.border_width_all(1)
	sb_back_normal.set_corner_radius_all(4)
	
	var sb_back_hover = StyleBoxFlat.new()
	sb_back_hover.bg_color = Color(0.18, 0.08, 0.08, 0.75)
	sb_back_hover.border_color = Color(1.0, 0.25, 0.25, 0.8)
	sb_back_hover.border_width_all(1)
	sb_back_hover.set_corner_radius_all(4)
	
	back_btn.add_theme_stylebox_override("normal", sb_back_normal)
	back_btn.add_theme_stylebox_override("hover", sb_back_hover)
	hdr.add_child(back_btn)

	# 2. STATUS BAR (y=60)
	var bar = _panel(Vector2(0, 60), Vector2(1280, 42), Color(0.04, 0.04, 0.05, 0.96), Color(0.65, 0.45, 1.0, 0.2))
	bar.name = "StatusStrip"
	scene_root.add_child(bar)
	
	var bal_lbl = Label.new()
	bal_lbl.text = "💵 Clean Cash: $0.00   ·   💀 Reputation: 0   ·   📜 Brand Partnership: None"
	bal_lbl.add_theme_font_size_override("font_size", 12)
	bal_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 1.0))
	bal_lbl.position = Vector2(24, 11)
	bal_lbl.name = "StatusStripLabel"
	bar.add_child(bal_lbl)

	# 3. SPLIT MAIN CONTAINER VIEWS (y=112)
	# Left: Tech Tree upgrades (Width: 700)
	var left_hdr = Label.new()
	left_hdr.text = "DEVELOPMENT BLUEPRINTS"
	left_hdr.add_theme_font_size_override("font_size", 12)
	left_hdr.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7, 1.0)) # Cyan accent
	left_hdr.position = Vector2(24, 114)
	scene_root.add_child(left_hdr)

	var tech_view = ScrollContainer.new()
	tech_view.position = Vector2(24, 138)
	tech_view.size = Vector2(680, 560)
	tech_view.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	tech_view.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	tech_view.name = "TechScroll"
	scene_root.add_child(tech_view)

	var tech_vbox = VBoxContainer.new()
	tech_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tech_vbox.add_theme_constants_override("separation", 14)
	tech_vbox.name = "TechVBox"
	tech_view.add_child(tech_vbox)

	# Right: Manufacturer contract drawer (Width: 520, pos_x: 730)
	var right_hdr = Label.new()
	right_hdr.text = "EXCLUSIVE BRAND SPONSORSHIP CONTRACTS"
	right_hdr.add_theme_font_size_override("font_size", 12)
	right_hdr.add_theme_color_override("font_color", Color(0.95, 0.75, 0.15, 1.0)) # Financial Amber
	right_hdr.position = Vector2(730, 114)
	scene_root.add_child(right_hdr)

	var brand_view = _panel(Vector2(730, 138), Vector2(526, 560), Color(0.05, 0.05, 0.08, 0.95), Color(0.95, 0.75, 0.15, 0.35))
	brand_view.name = "BrandView"
	scene_root.add_child(brand_view)

func _update_balances_strip() -> void:
	var label = _find(scene_root, "StatusStripLabel")
	if label and label is Label:
		var rep = GameState.reputation_score
		var clean = GameState.legal_balance
		var partner = active_partnership
		if partner == "NONE":
			partner = "None (No discount active)"
		label.text = "💵 Clean Cash: $%s   ·   💀 Reputation Score: %d   ·   📜 Brand Contract Sponsorship: %s" % [
			String.num(clean, 2), rep, partner
		]

func _render_research_nodes() -> void:
	var tech_vbox = _find(scene_root, "TechVBox")
	if not tech_vbox: return
	
	# Clear out previous cards
	for c in tech_vbox.get_children():
		c.queue_free()

	for node in research_nodes:
		var node_key = node.get("nodeKey", "")
		var label_txt = node.get("label", "R&D Upgrade")
		var desc = node.get("description", "")
		var cur_level = int(node.get("currentLevel", 0))
		var max_level = int(node.get("maxLevel", 3))
		var is_max = bool(node.get("isMaxLevel", false))
		var next_cost = node.get("nextUpgradeCost")
		
		# Main card container
		var border_col = Color(0.2, 0.9, 0.7, 0.4) if is_max else Color(0.65, 0.45, 1.0, 0.25)
		var card = _panel(Vector2.ZERO, Vector2(650, 94), Color(0.07, 0.06, 0.1, 0.92), border_col)
		card.custom_minimum_size = Vector2(650, 94)
		tech_vbox.add_child(card)

		# Row content
		var card_hbox = HBoxContainer.new()
		card_hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		card_hbox.add_theme_constants_override("separation", 16)
		card.add_child(card_hbox)
		
		# Spacer margin
		var spacing = Control.new()
		spacing.custom_minimum_size = Vector2(2, 0)
		card_hbox.add_child(spacing)

		# 1. Info block
		var info_vbox = VBoxContainer.new()
		info_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
		card_hbox.add_child(info_vbox)

		var title_lbl = Label.new()
		title_lbl.text = "⚙  " + label_txt.to_upper()
		title_lbl.add_theme_font_size_override("font_size", 12)
		title_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95, 1.0))
		info_vbox.add_child(title_lbl)

		var desc_lbl = Label.new()
		desc_lbl.text = desc
		desc_lbl.add_theme_font_size_override("font_size", 10)
		desc_lbl.add_theme_color_override("font_color", Color(0.6, 0.55, 0.7, 0.9))
		desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		info_vbox.add_child(desc_lbl)

		# 2. Level dots block
		var level_vbox = VBoxContainer.new()
		level_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
		level_vbox.custom_minimum_size = Vector2(100, 0)
		card_hbox.add_child(level_vbox)

		var lvl_title = Label.new()
		lvl_title.text = "RESEARCH PROGRESS"
		lvl_title.add_theme_font_size_override("font_size", 9)
		lvl_title.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55))
		lvl_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		level_vbox.add_child(lvl_title)

		var dots_hbox = HBoxContainer.new()
		dots_hbox.alignment = BoxContainer.ALIGNMENT_CENTER
		dots_hbox.add_theme_constants_override("separation", 6)
		level_vbox.add_child(dots_hbox)

		for idx in range(max_level):
			var dot = ColorRect.new()
			dot.custom_minimum_size = Vector2(12, 12)
			if idx < cur_level:
				dot.color = Color(0.2, 0.85, 0.45, 1.0) # Active levels glowing green
			else:
				dot.color = Color(0.2, 0.15, 0.28, 0.7) # Unreached levels dark purple
			dots_hbox.add_child(dot)

		var lvl_lbl = Label.new()
		lvl_lbl.text = "Level %d / %d" % [cur_level, max_level]
		lvl_lbl.add_theme_font_size_override("font_size", 10)
		lvl_lbl.add_theme_color_override("font_color", Color(0.8, 0.8, 0.9, 1.0))
		lvl_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		level_vbox.add_child(lvl_lbl)

		# 3. Purchase block
		var btn_vbox = VBoxContainer.new()
		btn_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
		btn_vbox.custom_minimum_size = Vector2(160, 0)
		card_hbox.add_child(btn_vbox)

		var upgrade_btn = Button.new()
		upgrade_btn.custom_minimum_size = Vector2(146, 38)
		btn_vbox.add_child(upgrade_btn)

		if is_max:
			upgrade_btn.text = "COMPLETED"
			upgrade_btn.disabled = true
			_style_customizer_btn(upgrade_btn, false, Color(0.4, 0.6, 0.4))
		else:
			var cost_val = int(next_cost) if next_cost != null else 0
			var formatted_cost = "$%s" % _fmt(cost_val)
			upgrade_btn.text = "RESEARCH: %s" % formatted_cost
			
			# Disable if cash insufficient
			if GameState.legal_balance < cost_val:
				upgrade_btn.disabled = true
				_style_customizer_btn(upgrade_btn, false, Color(1.0, 0.3, 0.3))
			else:
				_style_customizer_btn(upgrade_btn, true, Color(0.2, 0.85, 0.45))
				upgrade_btn.pressed.connect(func(): _execute_upgrade(node_key))

		var right_margin = Control.new()
		right_margin.custom_minimum_size = Vector2(4, 0)
		card_hbox.add_child(right_margin)

func _render_brand_contracts() -> void:
	var brand_view = _find(scene_root, "BrandView")
	if not brand_view: return
	
	# Clear out the children of BrandView
	for c in brand_view.get_children():
		c.queue_free()

	var panel_vbox = VBoxContainer.new()
	panel_vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel_vbox.add_theme_constants_override("separation", 12)
	brand_view.add_child(panel_vbox)
	
	# Spacer
	var sp1 = Control.new()
	sp1.custom_minimum_size = Vector2(0, 4)
	panel_vbox.add_child(sp1)

	# Label info
	var desc_lbl = Label.new()
	desc_lbl.text = "Sign or change your corporate brand contract endorsement. Partnering with a manufacturer requires a $150,000 flat filing fee, and grants a permanent 15% discount on all factory kitted acquisitions of that brand!"
	desc_lbl.add_theme_font_size_override("font_size", 10)
	desc_lbl.add_theme_color_override("font_color", Color(0.65, 0.6, 0.75, 0.95))
	desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc_lbl.custom_minimum_size = Vector2(480, 50)
	desc_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	panel_vbox.add_child(desc_lbl)

	# Active contract highlights
	var active_b_col = Color(0.2, 0.9, 0.7, 0.5) if active_partnership != "NONE" else Color(0.65, 0.45, 1.0, 0.3)
	var active_card = _panel(Vector2.ZERO, Vector2(480, 50), Color(0.09, 0.08, 0.14, 0.96), active_b_col)
	active_card.custom_minimum_size = Vector2(480, 50)
	panel_vbox.add_child(active_card)
	
	var active_lbl = Label.new()
	if active_partnership == "NONE":
		active_lbl.text = "📜  CURRENT STATUS: NO CONTRACT SPONSORSHIP"
		active_lbl.add_theme_color_override("font_color", Color(1.0, 0.4, 0.4, 1.0))
	else:
		active_lbl.text = "📜  CURRENT STATUS: EXCLUSIVE PARTNERSHIP WITH %s" % active_partnership
		active_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7, 1.0))
	active_lbl.add_theme_font_size_override("font_size", 11)
	active_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	active_lbl.position = Vector2(0, 16)
	active_lbl.size = Vector2(480, 18)
	active_card.add_child(active_lbl)

	# Brands specification list
	var scroll = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(480, 310)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	panel_vbox.add_child(scroll)

	var brand_vbox = VBoxContainer.new()
	brand_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	brand_vbox.add_theme_constants_override("separation", 10)
	scroll.add_child(brand_vbox)

	var brands_specs = [
		["SCARFIA", "Sweden • High-Performance Class-8 Haulers", "Premium Scarfia lineup discount."],
		["MOOSE", "Sweden • Heavy-Duty Offroad Rigging Engines", "Moose tactical transport discount."],
		["GUY", "Germany • Standard Cargo Box and Delivery Rigs", "Guy inner-city commercial transport discount."],
		["MYRCEDEZ", "Germany • Luxury Logistics Fleet Liners", "Myrcedez high-comfort cabin rigs discount."],
		["TESIO", "USA • Long-Range Battery Electric Logistics Vehicles", "TesIo green-haul technology rigs discount."],
		["LION", "Germany • Maximum Capacity Flatbeds and Refrigerated Rigs", "Lion multi-axle freight carriers discount."],
		["DRASIA", "Romania • Affordable Light Duty Cargo Haulers", "Drasia budget starter vans discount."]
	]

	for item in brands_specs:
		var item_name = item[0]
		var item_label = item[1]
		var item_desc = item[2]
		
		# Render card
		var item_b_col = Color(0.95, 0.75, 0.15, 0.7) if selected_brand == item_name else Color(0.18, 0.12, 0.28, 0.4)
		var item_card = _panel(Vector2.ZERO, Vector2(460, 68), Color(0.07, 0.06, 0.1, 0.95), item_b_col)
		item_card.custom_minimum_size = Vector2(460, 68)
		brand_vbox.add_child(item_card)
		
		if selected_brand == item_name:
			var style_sel = item_card.get_theme_stylebox("panel") as StyleBoxFlat
			if style_sel:
				style_sel.border_width_left = 3
		
		var card_btn = Button.new()
		card_btn.flat = true
		card_btn.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		card_btn.pressed.connect(func(): _select_brand(item_name))
		item_card.add_child(card_btn)

		var card_hbox = HBoxContainer.new()
		card_hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		card_hbox.add_theme_constants_override("separation", 12)
		card_hbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
		item_card.add_child(card_hbox)
		
		# Spacer
		var sc = Control.new()
		sc.custom_minimum_size = Vector2(2, 0)
		card_hbox.add_child(sc)

		var item_info = VBoxContainer.new()
		item_info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		item_info.alignment = BoxContainer.ALIGNMENT_CENTER
		item_info.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card_hbox.add_child(item_info)

		var item_title = Label.new()
		item_title.text = "⚡  " + item_name
		item_title.add_theme_font_size_override("font_size", 12)
		if active_partnership == item_name:
			item_title.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
			item_title.text += " [ACTIVE BRAND CONTRACT]"
		else:
			item_title.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))
		item_info.add_child(item_title)

		var item_lbl_sub = Label.new()
		item_lbl_sub.text = item_label
		item_lbl_sub.add_theme_font_size_override("font_size", 10)
		item_lbl_sub.add_theme_color_override("font_color", Color(0.6, 0.55, 0.7, 0.95))
		item_info.add_child(item_lbl_sub)

		var sel_rect = ColorRect.new()
		sel_rect.custom_minimum_size = Vector2(10, 10)
		if selected_brand == item_name:
			sel_rect.color = Color(0.95, 0.75, 0.15, 1.0) # Financial Amber active selection
		else:
			sel_rect.color = Color(0.2, 0.15, 0.28, 0.5)
		sel_rect.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		card_hbox.add_child(sel_rect)
		
		var right_margin = Control.new()
		right_margin.custom_minimum_size = Vector2(4, 0)
		card_hbox.add_child(right_margin)

	# Action purchase contract button
	var sign_btn = Button.new()
	sign_btn.custom_minimum_size = Vector2(480, 44)
	sign_btn.text = "SIGN EXCLUSIVE %s CONTRACT  —  $150,000" % selected_brand
	sign_btn.add_theme_font_size_override("font_size", 12)
	
	if active_partnership == selected_brand:
		sign_btn.text = "ALREADY PARTNERED WITH %s" % selected_brand
		sign_btn.disabled = true
		_style_customizer_btn(sign_btn, false, Color(0.4, 0.6, 0.4))
	elif GameState.legal_balance < 150000.00:
		sign_btn.disabled = true
		_style_customizer_btn(sign_btn, false, Color(1.0, 0.3, 0.3))
	else:
		_style_customizer_btn(sign_btn, true, Color(0.95, 0.75, 0.15))
		sign_btn.pressed.connect(func(): _execute_sign_partnership(selected_brand))
	
	panel_vbox.add_child(sign_btn)

func _select_brand(brand: String) -> void:
	selected_brand = brand
	_render_brand_contracts()

# ====================================================
# NETWORK COMMANDS
# ====================================================
func _execute_upgrade(node_key: String) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "nodeKey": node_key })
	
	upgrade_http.request(BASE_URL + "/upgrade", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Initiating R&D Lab upgrade simulation...", Color(0.65, 0.45, 1.0, 1.0))

func _execute_sign_partnership(brand: String) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "manufacturer": brand })
	
	brand_http.request(BASE_URL + "/sign-partnership", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Filing Brand Contract Partnership sponsorship...", Color(1.0, 0.8, 0.2, 1.0))

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

func _panel(pos: Vector2, sz: Vector2, col: Color, b_col: Color = Color(0.18, 0.12, 0.28, 0.6)) -> Control:
	var control = Control.new()
	control.position = pos
	control.size = sz
	control.custom_minimum_size = sz
	
	var p = PanelContainer.new()
	p.position = Vector2.ZERO
	p.size = sz
	p.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var s = StyleBoxFlat.new()
	var alpha_col = col
	alpha_col.a = 0.85 # Sleek translucent glassmorphism
	s.bg_color = alpha_col
	s.border_color = b_col
	s.border_width_bottom = 1; s.border_width_top = 1
	s.border_width_left = 1; s.border_width_right = 1
	s.set_corner_radius_all(6)
	p.add_theme_stylebox_override("panel", s)
	
	control.add_child(p)
	return control

func _btn(txt: String, pos: Vector2, sz: Vector2) -> Button:
	var b = Button.new()
	b.text = txt; b.position = pos; b.size = sz
	b.add_theme_font_size_override("font_size", 11)
	b.add_theme_color_override("font_color", Color(0.85, 0.75, 1.0, 1.0)) # Purple R&D tone
	
	var sb_normal = StyleBoxFlat.new()
	sb_normal.bg_color = Color(0.06, 0.05, 0.08, 0.6)
	sb_normal.border_color = Color(0.65, 0.45, 1.0, 0.3)
	sb_normal.border_width_all(1)
	sb_normal.set_corner_radius_all(4)
	
	var sb_hover = StyleBoxFlat.new()
	sb_hover.bg_color = Color(0.1, 0.08, 0.14, 0.8)
	sb_hover.border_color = Color(0.65, 0.45, 1.0, 0.6)
	sb_hover.border_width_all(1)
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
		sb_normal.bg_color = Color(accent_col.r * 0.15, accent_col.g * 0.15, accent_col.b * 0.15, 0.8)
		sb_normal.border_color = accent_col
		sb_normal.border_width_all(2)
		
		sb_hover.bg_color = Color(accent_col.r * 0.25, accent_col.g * 0.25, accent_col.b * 0.25, 0.9)
		sb_hover.border_color = accent_col
		sb_hover.border_width_all(2)
	else:
		sb_normal.bg_color = Color(0.06, 0.06, 0.08, 0.6)
		sb_normal.border_color = Color(0.15, 0.2, 0.28, 0.4)
		sb_normal.border_width_all(1)
		
		sb_hover.bg_color = Color(0.08, 0.09, 0.12, 0.8)
		sb_hover.border_color = Color(accent_col.r, accent_col.g, accent_col.b, 0.5)
		sb_hover.border_width_all(1)
		
	for sb in [sb_normal, sb_hover, sb_pressed]:
		sb.set_corner_radius_all(4)
		
	sb_pressed.bg_color = Color(accent_col.r * 0.3, accent_col.g * 0.3, accent_col.b * 0.3, 1.0)
	sb_pressed.border_color = accent_col
	sb_pressed.border_width_all(2)
	sb_pressed.set_corner_radius_all(4)
	
	sb_disabled.bg_color = Color(0.04, 0.04, 0.05, 0.3)
	sb_disabled.border_color = Color(0.1, 0.1, 0.12, 0.2)
	sb_disabled.border_width_all(1)
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
