extends Control

# ====================================================
# StaffManager.gd — Staff Development & Corporate Operations Center
# Programmatic premium UI layout with glassmorphism and real-time synchronisation.
# ====================================================

var BASE_URL: String:
	get: return NetworkManager.HTTP_URL + "/staff"

# Role information matching GameState keys
const ROLES = [
	{
		"id": "purchasing_agent",
		"name": "Purchasing Agent",
		"desc": "Secures corporate discounts on kitted fleet vehicle acquisitions and shop maintenance parts.",
		"color": Color(0.2, 0.9, 0.7), # Cyber Cyan
		"unit": "% discount",
		"base": 5.0
	},
	{
		"id": "lead_mechanic",
		"name": "Lead Mechanic",
		"desc": "Speeds up terminal fleet overhauls and secures massive discounts on emergency roadside repairs.",
		"color": Color(0.65, 0.45, 1.0), # Underworld Violet
		"unit": "% discount",
		"base": 10.0
	},
	{
		"id": "router",
		"name": "LogistiXpert Router",
		"desc": "Optimises shipping paths and cargo packing to increase payouts on all completed routes.",
		"color": Color(0.95, 0.55, 0.15), # Warning Orange
		"unit": "% boost",
		"base": 15.0
	}
]

const RANK_NAMES = {
	1: "Apprentice",
	2: "Junior Associate",
	3: "Senior Specialist",
	4: "Expert Coordinator",
	5: "LogistiXpert"
}

const RANK_MULTIPLIERS = {
	1: -0.25,
	2: 0.20,
	3: 0.50,
	4: 0.85,
	5: 1.25
}

# Local Server State Cache
var staff_data: Dictionary = {}
var is_loading: bool = true

@onready var scene_root = $CanvasLayer
@onready var get_http = $StaffHTTPRequest
@onready var unlock_http = $UnlockHTTPRequest
@onready var upgrade_http = $UpgradeHTTPRequest
@onready var promote_http = $PromoteHTTPRequest

func _ready() -> void:
	# Connect HTTP signals
	get_http.request_completed.connect(_on_get_response)
	unlock_http.request_completed.connect(_on_unlock_response)
	upgrade_http.request_completed.connect(_on_upgrade_response)
	promote_http.request_completed.connect(_on_promote_response)

	_build_ui()
	_fetch_staff_data()

# ====================================================
# FETCH & SYNC DATA
# ====================================================
func _fetch_staff_data() -> void:
	is_loading = true
	_update_loading_state()
	
	var token = GameState.auth_token
	if token.is_empty():
		_show_toast("✕ AUTHENTICATION ERROR", Color(1.0, 0.25, 0.25))
		return
	
	get_http.request(BASE_URL, ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)

func _on_get_response(_r, code, _h, body) -> void:
	is_loading = false
	if code == 200:
		var d = JSON.parse_string(body.get_string_from_utf8())
		if d and d.has("staff"):
			GameState.legal_balance = float(d.legalBalance)
			staff_data = d.staff
			_sync_to_gamestate()
			_update_balances_strip()
			_render_role_cards()
			return
	
	_show_toast("✕ Failed to fetch staff rosters from server.", Color(1.0, 0.25, 0.25))
	_update_loading_state()

func _sync_to_gamestate() -> void:
	# Synchronise local GameState cache with server values
	for role_id in staff_data.keys():
		var s = staff_data[role_id]
		if GameState.staff.has(role_id):
			GameState.staff[role_id].unlocked = s.unlocked
			GameState.staff[role_id].rank = s.rank
			GameState.staff[role_id].seminar_level = s.level
			# Update base values linearly
			if role_id == "purchasing_agent":
				GameState.staff[role_id].base_value = 5.0 * s.level
			elif role_id == "lead_mechanic":
				GameState.staff[role_id].base_value = 10.0 * s.level
			elif role_id == "router":
				GameState.staff[role_id].base_value = 15.0 * s.level
			
			GameState.staff_updated.emit(role_id)
	
	# Emit balance update to sync topbar labels
	GameState.balance_updated.emit(GameState.legal_balance, GameState.black_market_balance)

# ====================================================
# OPERATIONS HANDLERS
# ====================================================
func _unlock_role(role_id: String) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "roleId": role_id })
	
	unlock_http.request(BASE_URL + "/unlock", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Hiring operational coordinator...", Color(0.2, 0.9, 0.7))

func _on_unlock_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		_show_toast("✔ Operator hired successfully!", Color(0.2, 0.9, 0.45))
		UIEffects.play_success()
		_fetch_staff_data()
	else:
		var msg = parsed.get("message", "Hire rejected.") if parsed else "Server error."
		_show_toast("✕ Hire Failed: " + msg, Color(1.0, 0.25, 0.25))
		UIEffects.play_error()

func _upgrade_seminar(role_id: String) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "roleId": role_id })
	
	upgrade_http.request(BASE_URL + "/upgrade", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Booking training seminar seat...", Color(0.65, 0.45, 1.0))

func _on_upgrade_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		_show_toast("✔ Seminar complete! Base value upgraded.", Color(0.2, 0.9, 0.45))
		UIEffects.play_success()
		_fetch_staff_data()
	else:
		var msg = parsed.get("message", "Upgrade rejected.") if parsed else "Server error."
		_show_toast("✕ Upgrade Failed: " + msg, Color(1.0, 0.25, 0.25))
		UIEffects.play_error()

func _promote_rank(role_id: String) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "roleId": role_id })
	
	promote_http.request(BASE_URL + "/promote", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Reviewing performance promotion request...", Color(0.95, 0.55, 0.15))

func _on_promote_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		_show_toast("✔ Operator promoted to higher rank!", Color(0.2, 0.9, 0.45))
		UIEffects.play_success()
		_fetch_staff_data()
	else:
		var msg = parsed.get("message", "Promotion rejected.") if parsed else "Server error."
		_show_toast("✕ Promotion Failed: " + msg, Color(1.0, 0.25, 0.25))
		UIEffects.play_error()

# ====================================================
# PROGRAMMATIC UI LAYOUT
# ====================================================
func _build_ui() -> void:
	# Animated Background Grid
	var bg = CyberGridBackground.new()
	scene_root.add_child(bg)

	# 1. HEADER (y=0)
	var hdr = _panel(Vector2(0, 0), Vector2(1280, 60), Color(0.04, 0.05, 0.08, 0.95), Color(0.2, 0.9, 0.7, 0.35))
	scene_root.add_child(hdr)

	var title = Label.new()
	title.text = "👥  STAFF DEVELOPMENT AND OPERATIONS CENTER  —  HQ COMMAND"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7, 1.0))
	title.position = Vector2(24, 18)
	hdr.add_child(title)

	var back_btn = _btn("◀  MAP HUD", Vector2(1150, 11), Vector2(106, 38), Color(0.9, 0.3, 0.3))
	back_btn.pressed.connect(_go_back)
	hdr.add_child(back_btn)

	# 2. BALANCES STRIP (y=60)
	var bar = _panel(Vector2(0, 60), Vector2(1280, 42), Color(0.04, 0.04, 0.06, 0.92), Color(0.2, 0.9, 0.7, 0.2))
	bar.name = "StatusStrip"
	scene_root.add_child(bar)
	
	var bal_lbl = Label.new()
	bal_lbl.text = "💵 Corporate Cash Reserves: $0.00"
	bal_lbl.add_theme_font_size_override("font_size", 12)
	bal_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 1.0))
	bal_lbl.position = Vector2(24, 11)
	bal_lbl.name = "StatusStripLabel"
	bar.add_child(bal_lbl)

	# 3. CARDS CONTAINER PANEL (y=114, height=586)
	var main_panel = Control.new()
	main_panel.position = Vector2(0, 114)
	main_panel.name = "MainPanel"
	scene_root.add_child(main_panel)

func _update_balances_strip() -> void:
	var label = _find(scene_root, "StatusStripLabel")
	if label and label is Label:
		var clean = GameState.legal_balance
		label.text = "💵 Clean Cash Reserves: $%s  ·  👥 Active Operators: %d / 3" % [
			_fmt_decimals(clean), _get_unlocked_count()
		]

func _get_unlocked_count() -> int:
	var count = 0
	for k in staff_data.keys():
		if staff_data[k].unlocked:
			count += 1
	return count

func _update_loading_state() -> void:
	var main = _find(scene_root, "MainPanel")
	if not main: return
	
	# Clear previous nodes
	for child in main.get_children():
		child.queue_free()

	if is_loading:
		var loading_lbl = Label.new()
		loading_lbl.text = "SYNCING WITH OPERATIONS DATABASE..."
		loading_lbl.add_theme_font_size_override("font_size", 16)
		loading_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7, 0.5))
		loading_lbl.position = Vector2(490, 240)
		main.add_child(loading_lbl)

func _render_role_cards() -> void:
	var main = _find(scene_root, "MainPanel")
	if not main: return
	
	# Clear loading text or previous cards
	for child in main.get_children():
		child.queue_free()

	var card_w = 380
	var card_h = 540
	var spacing = 30
	var start_x = 40

	for i in range(ROLES.size()):
		var r = ROLES[i]
		var role_id = r.id
		var s = staff_data.get(role_id, { "unlocked": false, "level": 1, "rank": 1 })
		
		# Define Card Panel Container
		var card_x = start_x + i * (card_w + spacing)
		var card = _panel(Vector2(card_x, 10), Vector2(card_w, card_h), Color(0.06, 0.06, 0.09, 0.92), r.color * 0.3)
		main.add_child(card)

		# Inner layout VBox
		var vbox = VBoxContainer.new()
		vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		vbox.add_theme_constant_override("separation", 16)
		card.add_child(vbox)

		# Margin Spacer
		var sp = Control.new()
		sp.custom_minimum_size = Vector2(0, 4)
		vbox.add_child(sp)

		# 1. Role Title
		var title_lbl = Label.new()
		title_lbl.text = r.name.to_upper()
		title_lbl.add_theme_font_size_override("font_size", 16)
		title_lbl.add_theme_color_override("font_color", r.color)
		vbox.add_child(title_lbl)

		# 2. Description
		var desc_lbl = Label.new()
		desc_lbl.text = r.desc
		desc_lbl.add_theme_font_size_override("font_size", 10)
		desc_lbl.add_theme_color_override("font_color", Color(0.65, 0.65, 0.75, 0.85))
		desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc_lbl.custom_minimum_size = Vector2(card_w - 24, 52)
		vbox.add_child(desc_lbl)

		var div1 = ColorRect.new()
		div1.color = r.color * 0.2
		div1.custom_minimum_size = Vector2(0, 1)
		vbox.add_child(div1)

		if not s.unlocked:
			# LOCKED VIEW
			var lock_v = VBoxContainer.new()
			lock_v.size_flags_vertical = Control.SIZE_EXPAND_FILL
			lock_v.alignment = BoxContainer.ALIGNMENT_CENTER
			lock_v.add_theme_constant_override("separation", 12)
			vbox.add_child(lock_v)

			var lock_lbl = Label.new()
			lock_lbl.text = "🔒 STATUS: VACANT / LOCKED"
			lock_lbl.add_theme_font_size_override("font_size", 13)
			lock_lbl.add_theme_color_override("font_color", Color(0.7, 0.3, 0.3))
			lock_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			lock_v.add_child(lock_lbl)

			var hire_btn = Button.new()
			hire_btn.text = "HIRE OPERATOR\nCost: $%s Clean Cash" % _fmt(s.unlockCost)
			hire_btn.custom_minimum_size = Vector2(240, 48)
			hire_btn.add_theme_font_size_override("font_size", 11)
			
			var can_afford = GameState.legal_balance >= s.unlockCost
			_style_neon_btn(hire_btn, can_afford, r.color)
			if can_afford:
				hire_btn.pressed.connect(func(): _unlock_role(role_id))
			else:
				hire_btn.disabled = true
			
			lock_v.add_child(hire_btn)
		else:
			# UNLOCKED VIEW
			# A. Active Bonus Banner
			var bonus_val = r.base * s.level * RANK_MULTIPLIERS[s.rank]
			var bonus_panel = PanelContainer.new()
			var bp_style = StyleBoxFlat.new()
			bp_style.bg_color = Color(0.04, 0.22, 0.12, 0.2) if bonus_val > 0.0 else Color(0.22, 0.04, 0.04, 0.2)
			bp_style.border_color = Color(0.2, 0.85, 0.45, 0.5) if bonus_val > 0.0 else Color(0.9, 0.3, 0.3, 0.5)
			bp_style.border_width_left = 3
			bp_style.set_corner_radius_all(4)
			bonus_panel.add_theme_stylebox_override("panel", bp_style)
			vbox.add_child(bonus_panel)

			var bp_vbox = VBoxContainer.new()
			bp_vbox.add_theme_constant_override("separation", 2)
			bonus_panel.add_child(bp_vbox)

			var bp_lbl = Label.new()
			bp_lbl.add_theme_font_size_override("font_size", 12)
			if bonus_val > 0.0:
				bp_lbl.text = "✨ ACTIVE EFFECT: +%s%s" % [String.num(bonus_val, 2), r.unit]
				bp_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45))
			else:
				bp_lbl.text = "⚠️ ACTIVE PENALTY: -%s%s" % [String.num(abs(bonus_val), 2), r.unit]
				bp_lbl.add_theme_color_override("font_color", Color(0.9, 0.3, 0.3))
			bp_vbox.add_child(bp_lbl)

			var detail_lbl = Label.new()
			detail_lbl.add_theme_font_size_override("font_size", 9)
			detail_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7, 0.8))
			if role_id == "purchasing_agent":
				detail_lbl.text = "Lowers truck & part prices." if bonus_val > 0.0 else "Apprentice raises kitted vehicle costs."
			elif role_id == "lead_mechanic":
				detail_lbl.text = "Reduces terminal & roadside repair fees." if bonus_val > 0.0 else "Apprentice creates 25% repair fee premiums."
			elif role_id == "router":
				detail_lbl.text = "Increases delivery payouts." if bonus_val > 0.0 else "Apprentice routing slips cause delivery penalties."
			bp_vbox.add_child(detail_lbl)

			var div2 = ColorRect.new()
			div2.color = r.color * 0.15
			div2.custom_minimum_size = Vector2(0, 1)
			vbox.add_child(div2)

			# B. Seminar Level Section
			var sem_vbox = VBoxContainer.new()
			sem_vbox.add_theme_constant_override("separation", 6)
			vbox.add_child(sem_vbox)

			var sem_lbl = Label.new()
			sem_lbl.text = "🎓 TRAINING SEMINARS: Level %d / %d" % [s.level, MAX_LEVEL]
			sem_lbl.add_theme_font_size_override("font_size", 12)
			sem_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95))
			sem_vbox.add_child(sem_lbl)

			# Level Dots Indicator
			var dots_hbox = HBoxContainer.new()
			dots_hbox.add_theme_constant_override("separation", 8)
			sem_vbox.add_child(dots_hbox)
			for d_idx in range(MAX_LEVEL):
				var dot = ColorRect.new()
				dot.custom_minimum_size = Vector2(16, 6)
				if d_idx < s.level:
					dot.color = r.color
				else:
					dot.color = Color(0.18, 0.18, 0.24, 0.8)
				dots_hbox.add_child(dot)

			var sem_btn = Button.new()
			sem_vbox.add_child(sem_btn)
			if s.nextUpgradeCost == null:
				sem_btn.text = "MAX TRAINING LEVEL REACHED"
				sem_btn.disabled = true
				_style_neon_btn(sem_btn, false, r.color)
			else:
				sem_btn.text = "BOOK NEXT SEMINAR\nCost: $%s Clean Cash" % _fmt(s.nextUpgradeCost)
				sem_btn.custom_minimum_size = Vector2(0, 36)
				sem_btn.add_theme_font_size_override("font_size", 10)
				
				var can_afford_up = GameState.legal_balance >= s.nextUpgradeCost
				_style_neon_btn(sem_btn, can_afford_up, r.color)
				if can_afford_up:
					sem_btn.pressed.connect(func(): _upgrade_seminar(role_id))
				else:
					sem_btn.disabled = true

			# Spacer
			var sp_mid = Control.new()
			sp_mid.custom_minimum_size = Vector2(0, 4)
			vbox.add_child(sp_mid)

			# C. Operational Rank Section
			var rank_vbox = VBoxContainer.new()
			rank_vbox.add_theme_constant_override("separation", 6)
			vbox.add_child(rank_vbox)

			var rank_lbl = Label.new()
			rank_lbl.text = "⭐ OPERATIONAL RANK: Rank %d / %d" % [s.rank, MAX_RANK]
			rank_lbl.add_theme_font_size_override("font_size", 12)
			rank_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95))
			rank_vbox.add_child(rank_lbl)

			var rank_name_lbl = Label.new()
			var mult_sign = "+" if RANK_MULTIPLIERS[s.rank] > 0.0 else ""
			rank_name_lbl.text = "%s  (%s%sx multiplier)" % [RANK_NAMES[s.rank].to_upper(), mult_sign, String.num(RANK_MULTIPLIERS[s.rank], 2)]
			rank_name_lbl.add_theme_font_size_override("font_size", 11)
			rank_name_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45) if s.rank > 1 else Color(0.9, 0.3, 0.3))
			rank_vbox.add_child(rank_name_lbl)

			var promote_btn = Button.new()
			rank_vbox.add_child(promote_btn)
			if s.nextPromotionCost == null:
				promote_btn.text = "MAX RANK REACHED"
				promote_btn.disabled = true
				_style_neon_btn(promote_btn, false, r.color)
			else:
				promote_btn.text = "PROMOTE OPERATOR\nCost: $%s Clean Cash" % _fmt(s.nextPromotionCost)
				promote_btn.custom_minimum_size = Vector2(0, 36)
				promote_btn.add_theme_font_size_override("font_size", 10)
				
				var can_afford_pr = GameState.legal_balance >= s.nextPromotionCost
				_style_neon_btn(promote_btn, can_afford_pr, r.color)
				if can_afford_pr:
					promote_btn.pressed.connect(func(): _promote_rank(role_id))
				else:
					promote_btn.disabled = true

# ====================================================
# STYLING & HELPERS
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
	alpha_col.a = 0.85 # Translucent glassmorphism
	s.bg_color = alpha_col
	s.border_color = b_col
	s.border_width_bottom = 1; s.border_width_top = 1
	s.border_width_left = 1; s.border_width_right = 1
	s.set_corner_radius_all(6)
	p.add_theme_stylebox_override("panel", s)
	return p

func _btn(txt: String, pos: Vector2, sz: Vector2, text_col: Color = Color(0.75, 0.65, 0.9)) -> Button:
	var b = Button.new()
	b.text = txt; b.position = pos; b.size = sz
	b.add_theme_font_size_override("font_size", 11)
	b.add_theme_color_override("font_color", text_col)
	
	var sb_normal = StyleBoxFlat.new()
	sb_normal.bg_color = Color(0.08, 0.08, 0.12, 0.5)
	sb_normal.border_color = text_col * 0.4
	sb_normal.set_border_width_all(1)
	sb_normal.set_corner_radius_all(4)
	
	var sb_hover = StyleBoxFlat.new()
	sb_hover.bg_color = Color(0.12, 0.12, 0.18, 0.75)
	sb_hover.border_color = text_col
	sb_hover.set_border_width_all(1)
	sb_hover.set_corner_radius_all(4)
	
	b.add_theme_stylebox_override("normal", sb_normal)
	b.add_theme_stylebox_override("hover", sb_hover)
	return b

func _style_neon_btn(btn: Button, enabled: bool, color: Color) -> void:
	var sb_normal = StyleBoxFlat.new()
	var sb_hover = StyleBoxFlat.new()
	var sb_pressed = StyleBoxFlat.new()
	var sb_disabled = StyleBoxFlat.new()
	
	sb_normal.set_corner_radius_all(4)
	sb_hover.set_corner_radius_all(4)
	sb_pressed.set_corner_radius_all(4)
	sb_disabled.set_corner_radius_all(4)
	
	if enabled:
		sb_normal.bg_color = Color(color.r * 0.15, color.g * 0.15, color.b * 0.15, 0.7)
		sb_normal.border_color = color * 0.8
		sb_normal.set_border_width_all(2)
		
		sb_hover.bg_color = Color(color.r * 0.25, color.g * 0.25, color.b * 0.25, 0.9)
		sb_hover.border_color = color
		sb_hover.set_border_width_all(2)
		
		sb_pressed.bg_color = Color(color.r * 0.4, color.g * 0.4, color.b * 0.4, 1.0)
		sb_pressed.border_color = color
		sb_pressed.set_border_width_all(2)
		
		btn.add_theme_stylebox_override("normal", sb_normal)
		btn.add_theme_stylebox_override("hover", sb_hover)
		btn.add_theme_stylebox_override("pressed", sb_pressed)
		btn.add_theme_color_override("font_color", color)
		btn.add_theme_color_override("font_hover_color", Color.WHITE)
	else:
		sb_disabled.bg_color = Color(0.1, 0.1, 0.12, 0.4)
		sb_disabled.border_color = Color(0.25, 0.25, 0.3, 0.3)
		sb_disabled.set_border_width_all(1)
		
		btn.add_theme_stylebox_override("disabled", sb_disabled)
		btn.add_theme_color_override("font_disabled_color", Color(0.45, 0.45, 0.5, 0.7))

func _fmt(n: int) -> String:
	if n >= 1000000: return "%.1fM" % (float(n) / 1000000.0)
	if n >= 1000: return "%.1fK" % (float(n) / 1000.0)
	return str(n)

func _fmt_decimals(n: float) -> String:
	return String.num(n, 2)

func _find(root: Node, name: String) -> Node:
	if root.name == name: return root
	for c in root.get_children():
		var r = _find(c, name)
		if r: return r
	return null
