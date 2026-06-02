extends Control

# ====================================================
# FinanceMarket.gd — Underworld Corporate Stock Exchange, Gold Speculation, and Credit Loans Panel
# Programmatic high-fidelity UI layout with sleek dark-mode glassmorphism
# ====================================================

# Central REST Endpoint Prefix
var BASE_URL: String:
	get: return NetworkManager.HTTP_URL + "/finance"

# UI Navigation Tabs
enum Tab { OVERVIEW, STOCKS, CREDIT, SPECS }
var active_tab: Tab = Tab.OVERVIEW

# Core State Variables
var company_val: Dictionary = {}
var market_data: Dictionary = {}
var credit_data: Dictionary = {}
var active_listings: Array = []

var selected_listing_id: String = ""
var trade_qty: int = 1000
var loan_qty: float = 10000.00
var gold_qty: float = 5.0

@onready var scene_root = $CanvasLayer
@onready var val_http = $ValHTTPRequest
@onready var ipo_http = $IpoHTTPRequest
@onready var market_http = $MarketHTTPRequest
@onready var trade_http = $TradeHTTPRequest
@onready var credit_http = $CreditHTTPRequest
@onready var action_http = $ActionHTTPRequest

# Ticker tape coordinates
var ticker_text: String = "▼ LOADING UNDERWORLD SPOT PRICES..."
var ticker_offset: float = 0.0

func _ready() -> void:
	_build_ui()
	_fetch_all_data()
	
	# Connect to real-time WebSocket signals for live updates
	NetworkManager.market_gold_updated.connect(_on_ws_gold_update)
	NetworkManager.market_c500_updated.connect(_on_ws_c500_update)
	NetworkManager.company_balance_updated.connect(_on_ws_balance_update)

func _process(delta: float) -> void:
	# Scroll live stock ticker tape smoothly
	ticker_offset -= delta * 75.0
	var ticker = _find(scene_root, "TickerText")
	if ticker and ticker is Label:
		ticker.position.x = ticker_offset
		if ticker_offset < -800.0:
			ticker_offset = 1280.0

# ====================================================
# FETCH API DATA
# ====================================================
func _fetch_all_data() -> void:
	var token = GameState.auth_token
	if token.is_empty():
		return
		
	# 1. Fetch Company Valuation
	val_http.request(BASE_URL + "/valuation", ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)
	
	# 2. Fetch Loans & Credit Limits
	credit_http.request(BASE_URL + "/loans", ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)
	
	# 3. Fetch Stock Exchange listings
	market_http.request(BASE_URL + "/market", ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)

func _on_val_response(_r, code, _h, body) -> void:
	if code == 200:
		var d = JSON.parse_string(body.get_string_from_utf8())
		if d:
			company_val = d
			_update_balances_on_strip()
			if active_tab == Tab.OVERVIEW:
				_render_overview_tab()

func _on_credit_response(_r, code, _h, body) -> void:
	if code == 200:
		var d = JSON.parse_string(body.get_string_from_utf8())
		if d:
			credit_data = d
			if active_tab == Tab.CREDIT:
				_render_credit_tab()

func _on_market_response(_r, code, _h, body) -> void:
	if code == 200:
		var d = JSON.parse_string(body.get_string_from_utf8())
		if d:
			market_data = d
			active_listings = d.get("listings", [])
			_update_ticker_text(d.get("c500Index", 1000.0), d.get("goldPrice", 2000.0))
			if active_tab == Tab.STOCKS:
				_render_stocks_tab()
			elif active_tab == Tab.SPECS:
				_render_specs_tab()

func _update_ticker_text(c500: float, gold: float) -> void:
	ticker_text = "▲ C500 INDEX: %.2f PTS   ·   ✨ GOLD SPOT: $%.2f / OZ   ·   🎰 INVEST RESPONSIBLY   ·   🔥 KEEP POLICE HEAT UNDER 30%% FOR IPO" % [c500, gold]
	var ticker = _find(scene_root, "TickerText")
	if ticker and ticker is Label:
		ticker.text = ticker_text

# ====================================================
# PROGRAMMATIC UI SYSTEM
# ====================================================
func _build_ui() -> void:
	# Canvas container for absolute layered draws
	var layer = CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	scene_root = layer

	# Programmatic High-Fidelity Animated HUD Background
	var bg = CyberGridBackground.new()
	scene_root.add_child(bg)
		
	# HEADER
	var hdr = _panel(Vector2(0, 0), Vector2(1280, 60), Color(0.04, 0.05, 0.08, 0.95), Color(0.9, 0.75, 0.2, 0.35))
	scene_root.add_child(hdr)

	var title = Label.new()
	title.text = "🏛  UNDERWORLD CORPORATE FINANCES  —  C500 MARKET & CREDIT"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0))
	title.position = Vector2(20, 18)
	hdr.add_child(title)

	var back_btn = _btn("◀  MAP", Vector2(1170, 10), Vector2(90, 38))
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

	# TICKER TAPE OVERLAY (y=60)
	var tape = _panel(Vector2(0, 60), Vector2(1280, 30), Color(0.08, 0.01, 0.05, 0.97), Color(0.9, 0.75, 0.2, 0.15))
	tape.clip_contents = true
	scene_root.add_child(tape)

	var ticker_lbl = Label.new()
	ticker_lbl.text = ticker_text
	ticker_lbl.add_theme_font_size_override("font_size", 11)
	ticker_lbl.add_theme_color_override("font_color", Color(1.0, 0.8, 0.2, 0.8))
	ticker_lbl.position = Vector2(0, 5)
	ticker_lbl.name = "TickerText"
	tape.add_child(ticker_lbl)

	# BALANCE & REPUTATION STRIP (y=90)
	var strip = _panel(Vector2(0, 90), Vector2(1280, 42), Color(0.04, 0.04, 0.06, 0.95), Color(0.9, 0.75, 0.2, 0.2))
	strip.name = "BalancesStrip"
	scene_root.add_child(strip)
	
	var bal_lbl = Label.new()
	bal_lbl.text = "💵 $0 Legal Cash   ·   💜 $0 Black Market   ·   Reputation: 0   ·   Police Heat: 0%"
	bal_lbl.add_theme_font_size_override("font_size", 12)
	bal_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 1.0))
	bal_lbl.position = Vector2(20, 11)
	bal_lbl.name = "BalancesStripLabel"
	strip.add_child(bal_lbl)

	# TABS NAVIGATION BAR (y=132)
	var tabs = _panel(Vector2(0, 132), Vector2(1280, 48), Color(0.05, 0.05, 0.08, 0.9), Color(0.9, 0.75, 0.2, 0.2))
	scene_root.add_child(tabs)
	
	var btn_over = _btn("📋 VALUATION & IPO", Vector2(20, 6), Vector2(180, 36))
	btn_over.pressed.connect(func(): _switch_tab(Tab.OVERVIEW))
	tabs.add_child(btn_over)

	var btn_stock = _btn("📈 STOCK EXCHANGE", Vector2(210, 6), Vector2(180, 36))
	btn_stock.pressed.connect(func(): _switch_tab(Tab.STOCKS))
	tabs.add_child(btn_stock)

	var btn_cred = _btn("💳 DEBT & LOANS", Vector2(400, 6), Vector2(180, 36))
	btn_cred.pressed.connect(func(): _switch_tab(Tab.CREDIT))
	tabs.add_child(btn_cred)

	var btn_specs = _btn("✨ GOLD & ADVERTISING", Vector2(590, 6), Vector2(210, 36))
	btn_specs.pressed.connect(func(): _switch_tab(Tab.SPECS))
	tabs.add_child(btn_specs)

	# MAIN VIEW CONTAINER
	var view = _panel(Vector2(12, 190), Vector2(1256, 474), Color(0.04, 0.03, 0.06, 0.85), Color(0.9, 0.75, 0.2, 0.35))
	view.name = "MainView"
	scene_root.add_child(view)

	# HTTP Node mounts
	val_http = HTTPRequest.new()
	add_child(val_http)
	val_http.request_completed.connect(_on_val_response)

	ipo_http = HTTPRequest.new()
	add_child(ipo_http)
	ipo_http.request_completed.connect(_on_ipo_response)

	market_http = HTTPRequest.new()
	add_child(market_http)
	market_http.request_completed.connect(_on_market_response)

	trade_http = HTTPRequest.new()
	add_child(trade_http)
	trade_http.request_completed.connect(_on_trade_response)

	credit_http = HTTPRequest.new()
	add_child(credit_http)
	credit_http.request_completed.connect(_on_credit_response)

	action_http = HTTPRequest.new()
	add_child(action_http)
	action_http.request_completed.connect(_on_action_response)

	# Render initial view
	_switch_tab(Tab.OVERVIEW)

func _switch_tab(tab: Tab) -> void:
	active_tab = tab
	_fetch_all_data()

	var view = _find(scene_root, "MainView")
	if not view:
		return
	for c in view.get_children():
		c.queue_free()

	match active_tab:
		Tab.OVERVIEW:
			_render_overview_tab()
		Tab.STOCKS:
			_render_stocks_tab()
		Tab.CREDIT:
			_render_credit_tab()
		Tab.SPECS:
			_render_specs_tab()

func _update_balances_on_strip() -> void:
	var label = _find(scene_root, "BalancesStripLabel")
	if label and label is Label:
		var legal = company_val.get("legalBalance", GameState.legal_balance)
		var dirty = company_val.get("blackMarketBalance", GameState.black_market_balance)
		var rep = company_val.get("reputationScore", GameState.reputation_score)
		var heat = company_val.get("policeHeat", GameState.police_heat)
		label.text = "💵 $%.2f Legal Cash   ·   💜 $%.2f Black Market   ·   Reputation: %d   ·   Police Heat: %d%%" % [legal, dirty, rep, heat]

# ====================================================
# TAB 1: OVERVIEW & IPO LAUNCHER
# ====================================================
func _render_overview_tab() -> void:
	var view = _find(scene_root, "MainView")
	if not view or active_tab != Tab.OVERVIEW:
		return

	# Title
	var title = Label.new()
	title.text = "📋  CORPORATE BOOK VALUATION REPORT  —  NET ASSET LEDGERS"
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color(0.8, 0.75, 1.0, 1.0))
	title.position = Vector2(20, 16)
	view.add_child(title)

	# Left Column: Balance Sheet
	var left = _panel(Vector2(20, 48), Vector2(600, 400), Color(0.06, 0.05, 0.09, 0.95), Color(0.9, 0.75, 0.2, 0.25))
	view.add_child(left)

	var bs_lbl = Label.new()
	bs_lbl.text = "📊  AUDITED BALANCE SHEET"
	bs_lbl.add_theme_font_size_override("font_size", 13)
	bs_lbl.add_theme_color_override("font_color", Color(0.9, 0.8, 0.2, 1.0))
	bs_lbl.position = Vector2(16, 16)
	left.add_child(bs_lbl)

	# Asset entries
	var valuation = company_val.get("valuation", 10000.00)
	var legal = company_val.get("legalBalance", 0.0)
	var dirty = company_val.get("blackMarketBalance", 0.0)
	var debt = company_val.get("activeDebtPrincipal", 0.0)
	var rep = company_val.get("reputationScore", 0)

	var entries = [
		["💵  Legal Liquidity Reserves", legal, Color(0.2, 0.85, 0.45, 1.0)],
		["💜  Black Market Reserves", dirty, Color(0.7, 0.35, 1.0, 1.0)],
		["🏢  Garage Infrastructure Books", "Book value", Color(0.2, 0.7, 1.0, 1.0)],
		["🚛  Depreciated Fleet Assets", "Book value", Color(0.2, 0.7, 1.0, 1.0)],
		["⭐  Reputation Asset multiplier", float(rep * 1000.0), Color(1.0, 0.75, 0.2, 1.0)],
		["⛔  Outstanding Loan Principal Liabilities", -debt, Color(1.0, 0.25, 0.25, 1.0)]
	]

	var y = 52
	for entry in entries:
		var lbl_name = Label.new()
		lbl_name.text = entry[0]
		lbl_name.add_theme_font_size_override("font_size", 12)
		lbl_name.position = Vector2(16, y)
		left.add_child(lbl_name)

		var lbl_val = Label.new()
		if entry[1] is String:
			lbl_val.text = entry[1]
		else:
			lbl_val.text = "$%.2f" % entry[1]
		lbl_val.add_theme_font_size_override("font_size", 12)
		lbl_val.add_theme_color_override("font_color", entry[2])
		lbl_val.position = Vector2(460, y)
		left.add_child(lbl_val)
		y += 28

	var div = ColorRect.new()
	div.color = Color(0.3, 0.2, 0.5, 0.5)
	div.position = Vector2(16, y + 6)
	div.size = Vector2(568, 1)
	left.add_child(div)

	y += 18
	var lbl_net = Label.new()
	lbl_net.text = "🏛  ESTIMATED NET CORPORATE VALUATION:"
	lbl_net.add_theme_font_size_override("font_size", 13)
	lbl_net.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0))
	lbl_net.position = Vector2(16, y)
	left.add_child(lbl_net)

	var lbl_net_val = Label.new()
	lbl_net_val.text = "$%.2f" % valuation
	lbl_net_val.add_theme_font_size_override("font_size", 15)
	lbl_net_val.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0))
	lbl_net_val.position = Vector2(460, y - 2)
	left.add_child(lbl_net_val)

	var share_price = valuation / company_val.get("totalShares", 1000000)
	var lbl_sh = Label.new()
	lbl_sh.text = "Calculated Book Share Price:  $%.4f / Share  (Based on %s outstanding)" % [share_price, _fmt(company_val.get("totalShares", 1000000))]
	lbl_sh.add_theme_font_size_override("font_size", 10)
	lbl_sh.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
	lbl_sh.position = Vector2(16, y + 26)
	left.add_child(lbl_sh)

	# Right Column: IPO Launcher Panel
	var right = _panel(Vector2(640, 48), Vector2(596, 400), Color(0.06, 0.05, 0.09, 0.95), Color(0.85, 0.6, 1.0, 0.25))
	view.add_child(right)

	var ipo_title = Label.new()
	ipo_title.text = "🔔  INITIAL PUBLIC OFFERING (IPO) LAUNCHPAD"
	ipo_title.add_theme_font_size_override("font_size", 13)
	ipo_title.add_theme_color_override("font_color", Color(0.85, 0.6, 1.0, 1.0))
	ipo_title.position = Vector2(16, 16)
	right.add_child(ipo_title)

	var ipo_desc = Label.new()
	ipo_desc.text = "Going public lets competitor players buy shares in your firm. Your valuation will contribute directly to the dynamic Underworld C500 Index points. Public status unlocks premium corporate credits, brand dealerships, and massive cash infusions."
	ipo_desc.add_theme_font_size_override("font_size", 11)
	ipo_desc.add_theme_color_override("font_color", Color(0.65, 0.65, 0.75, 0.9))
	ipo_desc.position = Vector2(16, 44)
	ipo_desc.size = Vector2(560, 60)
	ipo_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(ipo_desc)

	# Checklist
	var is_public = company_val.get("isPublic", false)
	if is_public:
		var pub_lbl = Label.new()
		pub_lbl.text = "⚡ PUBLIC COMPANY STATUS ACTIVE ⚡\n\nYour company shares are actively traded on the stock market!\nTrack your live share price fluctuating under the Stock Exchange tab."
		pub_lbl.add_theme_font_size_override("font_size", 14)
		pub_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5, 1.0))
		pub_lbl.position = Vector2(16, 150)
		pub_lbl.size = Vector2(560, 120)
		pub_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		right.add_child(pub_lbl)
	else:
		var chk_lbl = Label.new()
		chk_lbl.text = "IPO VERIFICATION CHECKLIST:"
		chk_lbl.add_theme_font_size_override("font_size", 11)
		chk_lbl.add_theme_color_override("font_color", Color(0.55, 0.5, 0.7, 1.0))
		chk_lbl.position = Vector2(16, 120)
		right.add_child(chk_lbl)

		var can_launch = true
		
		# IPO Requirements checklist
		var min_val = 4500000.00 # $4.5M
		var reqs = [
			["Corporate Valuation >= $4.5M", valuation >= min_val, "$%.2f / $%.2f" % [valuation, min_val]],
			["Schengen Deliveries Completed >= 300", false, "Estimated check"], # handled server-side dynamically
			["Underworld Police Heat < 30%", company_val.get("policeHeat", 0) < 30, "Current: %d%%" % company_val.get("policeHeat", 0)]
		]

		var cy = 144
		for req in reqs:
			var checkbox = Label.new()
			checkbox.text = "✔" if req[1] else "✕"
			checkbox.add_theme_font_size_override("font_size", 13)
			checkbox.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5, 1.0) if req[1] else Color(1.0, 0.3, 0.3, 1.0))
			checkbox.position = Vector2(16, cy)
			right.add_child(checkbox)

			var req_lbl = Label.new()
			req_lbl.text = req[0]
			req_lbl.add_theme_font_size_override("font_size", 11)
			req_lbl.position = Vector2(40, cy + 1)
			right.add_child(req_lbl)

			var met_lbl = Label.new()
			met_lbl.text = req[2]
			met_lbl.add_theme_font_size_override("font_size", 10)
			met_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
			met_lbl.position = Vector2(380, cy + 1)
			right.add_child(met_lbl)

			if not req[1]:
				can_launch = false
			cy += 24

		var launch_btn = Button.new()
		launch_btn.text = "🚀  LAUNCH INITIAL PUBLIC OFFERING" if can_launch else "✕  REQUIREMENTS NOT MET"
		launch_btn.position = Vector2(16, 320)
		launch_btn.size = Vector2(560, 50)
		launch_btn.disabled = not can_launch
		if can_launch:
			launch_btn.add_theme_color_override("font_color", Color(0.85, 0.6, 1.0, 1.0))
			launch_btn.pressed.connect(_launch_ipo)
		else:
			launch_btn.add_theme_color_override("font_color", Color(0.4, 0.35, 0.45, 1.0))
		right.add_child(launch_btn)

# ====================================================
# TAB 2: STOCK EXCHANGE LISTINGS
# ====================================================
func _render_stocks_tab() -> void:
	var view = _find(scene_root, "MainView")
	if not view or active_tab != Tab.STOCKS:
		return

	# Header Columns
	var list_panel = _panel(Vector2(20, 16), Vector2(740, 432), Color(0.06, 0.05, 0.09, 0.95), Color(0.9, 0.75, 0.2, 0.25))
	view.add_child(list_panel)

	var table_title = Label.new()
	table_title.text = "🏛  C500 PUBLIC BOARD  —  COMPETITOR LISTINGS"
	table_title.add_theme_font_size_override("font_size", 12)
	table_title.add_theme_color_override("font_color", Color(0.8, 0.75, 1.0, 1.0))
	table_title.position = Vector2(16, 12)
	list_panel.add_child(table_title)

	var scroll = ScrollContainer.new()
	scroll.position = Vector2(12, 42)
	scroll.size = Vector2(716, 376)
	list_panel.add_child(scroll)

	var list = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)

	# Render rows
	if active_listings.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "No public companies available.\nWhen competitor firms reach IPO requirements, they appear here."
		empty_lbl.add_theme_font_size_override("font_size", 12)
		empty_lbl.add_theme_color_override("font_color", Color(0.45, 0.42, 0.55, 1.0))
		empty_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_lbl.position = Vector2(150, 120)
		scroll.add_child(empty_lbl)
	else:
		for listing in active_listings:
			var row = _make_stock_row(listing)
			list.add_child(row)

	# Right Column: Buy/Sell Panel
	var trade_panel = _panel(Vector2(780, 16), Vector2(456, 432), Color(0.06, 0.05, 0.09, 0.95), Color(0.9, 0.75, 0.2, 0.3))
	view.add_child(trade_panel)

	var tr_lbl = Label.new()
	tr_lbl.text = "🛒  INVESTMENT & HOSTILE TAKEOVER"
	tr_lbl.add_theme_font_size_override("font_size", 12)
	tr_lbl.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0))
	tr_lbl.position = Vector2(16, 16)
	trade_panel.add_child(tr_lbl)

	if selected_listing_id.is_empty():
		var sel_lbl = Label.new()
		sel_lbl.text = "◀  SELECT A LISTING\nFROM THE PUBLIC BOARD\nTO INITIATE TRADING"
		sel_lbl.add_theme_font_size_override("font_size", 13)
		sel_lbl.add_theme_color_override("font_color", Color(0.35, 0.32, 0.45, 1.0))
		sel_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		sel_lbl.position = Vector2(60, 150)
		sel_lbl.size = Vector2(336, 100)
		sel_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		trade_panel.add_child(sel_lbl)
	else:
		var target = null
		for l in active_listings:
			if l.companyId == selected_listing_id:
				target = l
				break
		if target:
			_render_trading_details(trade_panel, target)

func _make_stock_row(listing: Dictionary) -> Control:
	var row = PanelContainer.new()
	row.custom_minimum_size = Vector2(710, 52)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.08, 0.15, 0.8) if selected_listing_id == listing.companyId else Color(0.07, 0.06, 0.1, 0.6)
	style.border_color = Color(0.8, 0.7, 1.0, 0.7) if selected_listing_id == listing.companyId else Color(0.15, 0.12, 0.25, 0.4)
	style.border_width_bottom = 1
	style.border_width_left = 3 if selected_listing_id == listing.companyId else 0
	row.add_theme_stylebox_override("panel", style)

	var hbox = HBoxContainer.new()
	hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.add_child(hbox)

	var spacer = Control.new()
	spacer.custom_minimum_size = Vector2(10, 0)
	hbox.add_child(spacer)

	# Name
	var name_lbl = Label.new()
	name_lbl.text = listing.name
	name_lbl.add_theme_font_size_override("font_size", 12)
	name_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95, 1.0))
	name_lbl.custom_minimum_size = Vector2(180, 0)
	hbox.add_child(name_lbl)

	# Valuation
	var val_lbl = Label.new()
	val_lbl.text = "Valuation: $%s" % _fmt(listing.valuation)
	val_lbl.add_theme_font_size_override("font_size", 11)
	val_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
	val_lbl.custom_minimum_size = Vector2(150, 0)
	hbox.add_child(val_lbl)

	# Share Price
	var price_lbl = Label.new()
	price_lbl.text = "$%.4f / Sh" % listing.sharePrice
	price_lbl.add_theme_font_size_override("font_size", 12)
	price_lbl.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0))
	price_lbl.custom_minimum_size = Vector2(120, 0)
	hbox.add_child(price_lbl)

	# Select button
	var btn = Button.new()
	btn.text = "SELECT"
	btn.custom_minimum_size = Vector2(90, 32)
	btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	btn.pressed.connect(func():
		selected_listing_id = listing.companyId
		_render_stocks_tab()
	)
	hbox.add_child(btn)

	return row

func _render_trading_details(panel: PanelContainer, target: Dictionary) -> void:
	# Details about target
	var t_lbl = Label.new()
	t_lbl.text = "Target: " + target.name
	t_lbl.add_theme_font_size_override("font_size", 14)
	t_lbl.add_theme_color_override("font_color", Color(0.8, 0.6, 1.0, 1.0))
	t_lbl.position = Vector2(16, 48)
	panel.add_child(t_lbl)

	var p_lbl = Label.new()
	p_lbl.text = "Market Price:  $%.4f per Share" % target.sharePrice
	p_lbl.add_theme_font_size_override("font_size", 12)
	p_lbl.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0))
	p_lbl.position = Vector2(16, 74)
	panel.add_child(p_lbl)

	# Quantity inputs
	var qty_lbl = Label.new()
	qty_lbl.text = "Share Quantity to Trade:"
	qty_lbl.add_theme_font_size_override("font_size", 11)
	qty_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
	qty_lbl.position = Vector2(16, 114)
	panel.add_child(qty_lbl)

	# Adjust Qty Buttons
	var qtys = [500, 1000, 5000, 20000]
	var q_x = 16
	for q in qtys:
		var q_btn = Button.new()
		q_btn.text = "+" + _fmt(q)
		q_btn.position = Vector2(q_x, 134)
		q_btn.size = Vector2(90, 28)
		_style_customizer_btn(q_btn, trade_qty == q, Color(0.9, 0.75, 0.2))
		q_btn.pressed.connect(func():
			trade_qty = q
			_render_stocks_tab()
		)
		panel.add_child(q_btn)
		q_x += 104

	var q_lbl = Label.new()
	q_lbl.text = "Trade Volume: %s Shares" % _fmt(trade_qty)
	q_lbl.add_theme_font_size_override("font_size", 13)
	q_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.9, 1.0))
	q_lbl.position = Vector2(16, 178)
	q_lbl.name = "TradeQtyLabel"
	panel.add_child(q_lbl)

	var est = target.sharePrice * trade_qty
	var est_lbl = Label.new()
	est_lbl.text = "Total Cost estimate: $%.2f" % est
	est_lbl.add_theme_font_size_override("font_size", 12)
	est_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45, 1.0))
	est_lbl.position = Vector2(16, 204)
	est_lbl.name = "TotalEstLabel"
	panel.add_child(est_lbl)

	# Warning text (takeover limits, tax)
	var warn = Label.new()
	warn.text = "🚨 Takeover Shield Limit: You cannot own more than 49% of outstanding shares. Day-trading holding period < 10 mins triggers short-term Capital Gains surcharges."
	warn.add_theme_font_size_override("font_size", 10)
	warn.add_theme_color_override("font_color", Color(1.0, 0.45, 0.2, 0.8))
	warn.position = Vector2(16, 238)
	warn.size = Vector2(424, 48)
	warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	panel.add_child(warn)

	# Transact buttons
	var buy_btn = Button.new()
	buy_btn.text = "✔  BUY SHARES"
	buy_btn.position = Vector2(16, 310)
	buy_btn.size = Vector2(200, 44)
	buy_btn.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45, 1.0))
	buy_btn.pressed.connect(func(): _execute_trade("BUY", target.companyId))
	panel.add_child(buy_btn)

	var sell_btn = Button.new()
	sell_btn.text = "✕  SELL SHARES"
	sell_btn.position = Vector2(240, 310)
	sell_btn.size = Vector2(200, 44)
	sell_btn.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
	sell_btn.pressed.connect(func(): _execute_trade("SELL", target.companyId))
	panel.add_child(sell_btn)

func _execute_trade(action_type: String, target_id: String) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({
		"targetCompanyId": target_id,
		"action": action_type,
		"sharesAmount": trade_qty
	})

	trade_http.request(BASE_URL + "/trade", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Transacting stock trade...", Color(0.8, 0.7, 1.0, 1.0))

func _on_trade_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		var msg = parsed.get("message", "Trade executed successfully.")
		_show_toast("✔ " + msg, Color(0.2, 0.9, 0.5, 1.0))
		_fetch_all_data()
	else:
		var err = parsed.get("error", "UNKNOWN") if parsed else "SERVER_ERROR"
		var msg_map = {
			"INSUFFICIENT_FUNDS": "Insufficient clean cash to execute trade.",
			"INSUFFICIENT_SHARES": "You do not hold enough shares to execute sale.",
			"OWNERSHIP_LIMIT_EXCEEDED": "Takeover Limit! Cannot own >49% of competitor shares.",
			"NOT_PUBLIC": "Target company is not public."
		}
		_show_toast("✕ Trade Failed: " + msg_map.get(err, err), Color(1.0, 0.25, 0.25, 1.0))

# ====================================================
# TAB 3: CREDIT, LOANS, APR
# ====================================================
func _render_credit_tab() -> void:
	var view = _find(scene_root, "MainView")
	if not view or active_tab != Tab.CREDIT:
		return

	# Left Panel: Status Gauges
	var left = _panel(Vector2(20, 16), Vector2(600, 432), Color(0.06, 0.05, 0.09, 0.95), Color(0.9, 0.75, 0.2, 0.3))
	view.add_child(left)

	var c_lbl = Label.new()
	c_lbl.text = "🏦  CREDIT CEILING & ASSET COLLATERAL"
	c_lbl.add_theme_font_size_override("font_size", 12)
	c_lbl.add_theme_color_override("font_color", Color(0.8, 0.75, 1.0, 1.0))
	c_lbl.position = Vector2(16, 16)
	left.add_child(c_lbl)

	# Read credit details
	var ceiling = credit_data.get("creditCeiling", 50000.00)
	var principal = credit_data.get("activeDebtPrincipal", 0.0)
	var apr = credit_data.get("activeDebtInterest", 12.0)
	var collateral = credit_data.get("collateralValue", 0.0)

	var details = [
		["🏭  Total Asset Collateral Base Value", collateral, Color(0.2, 0.7, 1.0, 1.0)],
		["🛡  Dynamic Rep-adjusted Credit Limit", ceiling, Color(0.9, 0.75, 0.2, 1.0)],
		["⛔  Outstanding Debt Liability Balance", principal, Color(1.0, 0.3, 0.3, 1.0)],
		["📈  Calculated Interest APR Offer", apr, Color(1.0, 0.7, 0.2, 1.0)]
	]

	var y = 52
	for d in details:
		var lbl_n = Label.new()
		lbl_n.text = d[0]
		lbl_n.add_theme_font_size_override("font_size", 12)
		lbl_n.position = Vector2(16, y)
		left.add_child(lbl_n)

		var lbl_v = Label.new()
		if d[0].contains("APR"):
			lbl_v.text = "%.2f%%" % d[1]
		else:
			lbl_v.text = "$%.2f" % d[1]
		lbl_v.add_theme_font_size_override("font_size", 12)
		lbl_v.add_theme_color_override("font_color", d[2])
		lbl_v.position = Vector2(440, y)
		left.add_child(lbl_v)
		y += 32

	# Credit indicator progress bar
	var bar_lbl = Label.new()
	bar_lbl.text = "LOAN UTILIZATION BURDEN:"
	bar_lbl.add_theme_font_size_override("font_size", 10)
	bar_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
	bar_lbl.position = Vector2(16, y + 16)
	left.add_child(bar_lbl)

	var bar_bg = ColorRect.new()
	bar_bg.color = Color(0.1, 0.08, 0.14, 0.9)
	bar_bg.position = Vector2(16, y + 36)
	bar_bg.size = Vector2(568, 16)
	left.add_child(bar_bg)

	var pct = 0.0
	if ceiling > 0:
		pct = clamp(principal / ceiling, 0.0, 1.0)

	var bar_fill = ColorRect.new()
	bar_fill.color = Color(1.0, 0.3, 0.1, 1.0) if pct > 0.8 else (Color(1.0, 0.7, 0.2, 1.0) if pct > 0.4 else Color(0.2, 0.85, 0.45, 1.0))
	bar_fill.position = Vector2(16, y + 36)
	bar_fill.size = Vector2(568 * pct, 16)
	left.add_child(bar_fill)

	var usage_lbl = Label.new()
	usage_lbl.text = "%.1f%% Utilized" % (pct * 100.0)
	usage_lbl.add_theme_font_size_override("font_size", 11)
	usage_lbl.add_theme_color_override("font_color", bar_fill.color)
	usage_lbl.position = Vector2(16, y + 56)
	left.add_child(usage_lbl)

	# Right Panel: Borrow/Repay Transaction Controls
	var right = _panel(Vector2(640, 16), Vector2(596, 432), Color(0.06, 0.05, 0.09, 0.95), Color(0.9, 0.75, 0.2, 0.3))
	view.add_child(right)

	var trans_title = Label.new()
	trans_title.text = "💰  LOAN BORROWING & AMORTIZATION"
	trans_title.add_theme_font_size_override("font_size", 12)
	trans_title.add_theme_color_override("font_color", Color(0.85, 0.6, 1.0, 1.0))
	trans_title.position = Vector2(16, 16)
	right.add_child(trans_title)

	var amt_lbl = Label.new()
	amt_lbl.text = "Select Transaction Amount:"
	amt_lbl.add_theme_font_size_override("font_size", 11)
	amt_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
	amt_lbl.position = Vector2(16, 48)
	right.add_child(amt_lbl)

	var loan_qtys = [5000.00, 20000.00, 50000.00, 100000.00]
	var lx = 16
	for lq in loan_qtys:
		var l_btn = Button.new()
		l_btn.text = "+$" + _fmt(int(lq))
		l_btn.position = Vector2(lx, 68)
		l_btn.size = Vector2(120, 30)
		_style_customizer_btn(l_btn, loan_qty == lq, Color(0.9, 0.75, 0.2))
		l_btn.pressed.connect(func():
			loan_qty = lq
			_render_credit_tab()
		)
		right.add_child(l_btn)
		lx += 134

	var sel_vol = Label.new()
	sel_vol.text = "Selected Volume:  $%.2f" % loan_qty
	sel_vol.add_theme_font_size_override("font_size", 14)
	sel_vol.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95, 1.0))
	sel_vol.position = Vector2(16, 114)
	sel_vol.name = "LoanAmountLabel"
	right.add_child(sel_vol)

	var desc_warn = Label.new()
	desc_warn.text = "⚠️ Realtime Interest Accrual: Outstanding loans accrue continuous interest clean charges on the server background financial ticker. Debts exceeding dynamic insolvency boundaries trigger immediate bank repossession timers!"
	desc_warn.add_theme_font_size_override("font_size", 10)
	desc_warn.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35, 0.85))
	desc_warn.position = Vector2(16, 150)
	desc_warn.size = Vector2(560, 48)
	desc_warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(desc_warn)

	# Borrow & Repay buttons
	var borrow_btn = Button.new()
	borrow_btn.text = "📥  BORROW CLEAN FUNDS"
	borrow_btn.position = Vector2(16, 220)
	borrow_btn.size = Vector2(560, 44)
	borrow_btn.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45, 1.0))
	borrow_btn.pressed.connect(func(): _execute_credit_action("loans/borrow", loan_qty))
	right.add_child(borrow_btn)

	var repay_btn = Button.new()
	repay_btn.text = "📤  REPAY DEBT PRINCIPAL"
	repay_btn.position = Vector2(16, 280)
	repay_btn.size = Vector2(560, 44)
	repay_btn.add_theme_color_override("font_color", Color(1.0, 0.7, 0.2, 1.0))
	repay_btn.pressed.connect(func(): _execute_credit_action("loans/repay", loan_qty))
	right.add_child(repay_btn)

func _execute_credit_action(endpoint_path: String, amount: float) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "amount": amount })

	action_http.request(BASE_URL + "/" + endpoint_path, headers, HTTPClient.METHOD_POST, body)
	_show_toast("Processing banking transaction...", Color(0.7, 0.6, 0.9, 1.0))

func _on_action_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		var msg = parsed.get("message", "Loan transaction approved.")
		_show_toast("✔ " + msg, Color(0.2, 0.9, 0.5, 1.0))
		_fetch_all_data()
	else:
		var err = parsed.get("error", "UNKNOWN") if parsed else "SERVER_ERROR"
		var msg_map = {
			"INSUFFICIENT_FUNDS": "Insufficient clean cash to repay outstanding principal.",
			"CREDIT_LIMIT_EXCEEDED": "Financing Rejected: Asset credit limit exceeded.",
			"NO_DEBT": "Your company does not hold any outstanding debts."
		}
		_show_toast("✕ Banking Refused: " + msg_map.get(err, err), Color(1.0, 0.25, 0.25, 1.0))

# ====================================================
# TAB 4: GOLD RESERVES & MARKETING
# ====================================================
func _render_specs_tab() -> void:
	var view = _find(scene_root, "MainView")
	if not view or active_tab != Tab.SPECS:
		return

	# Left Column: Gold spot speculation
	var left = _panel(Vector2(20, 16), Vector2(600, 432), Color(0.06, 0.05, 0.09, 0.95), Color(0.9, 0.75, 0.2, 0.35))
	view.add_child(left)

	var g_lbl = Label.new()
	g_lbl.text = "✨  GOLD BULLION SPECULATION  —  CLEAN CASH PROTECTOR"
	g_lbl.add_theme_font_size_override("font_size", 12)
	g_lbl.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0))
	g_lbl.position = Vector2(16, 16)
	left.add_child(g_lbl)

	# Read gold stock
	var gold_oz = company_val.get("goldStock", 0.0)
	var spot_gold = market_data.get("goldPrice", 2000.00)

	var gd_lbl = Label.new()
	gd_lbl.text = "Your Vault Reserves:  %.2f oz  (Value: $%.2f)" % [gold_oz, float(gold_oz * spot_gold)]
	gd_lbl.add_theme_font_size_override("font_size", 13)
	gd_lbl.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45, 1.0))
	gd_lbl.position = Vector2(16, 52)
	left.add_child(gd_lbl)

	var qty_lbl = Label.new()
	qty_lbl.text = "Trading volume (Ounces):"
	qty_lbl.add_theme_font_size_override("font_size", 11)
	qty_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6, 1.0))
	qty_lbl.position = Vector2(16, 96)
	left.add_child(qty_lbl)

	var gold_vols = [1.0, 5.0, 10.0, 50.0]
	var gx = 16
	for gq in gold_vols:
		var g_btn = Button.new()
		g_btn.text = "%.1f oz" % gq
		g_btn.position = Vector2(gx, 116)
		g_btn.size = Vector2(120, 28)
		_style_customizer_btn(g_btn, gold_qty == gq, Color(0.9, 0.75, 0.2))
		g_btn.pressed.connect(func():
			gold_qty = gq
			_render_specs_tab()
		)
		left.add_child(g_btn)
		gx += 134

	var gold_sel = Label.new()
	gold_sel.text = "Selected Gold Volume:  %.1f oz (Cost: $%.2f)" % [gold_qty, (spot_gold * gold_qty)]
	gold_sel.add_theme_font_size_override("font_size", 13)
	gold_sel.add_theme_color_override("font_color", Color(0.85, 0.85, 0.95, 1.0))
	gold_sel.position = Vector2(16, 162)
	gold_sel.name = "SelectedGoldQtyLabel"
	left.add_child(gold_sel)

	var gold_warn = Label.new()
	gold_warn.text = "Gold spot prices fluctuate on a 60s random-walk ticker. Gold is stored securely in your central vault, acts as book asset collateral to pump credit limits, and is immune to police confiscation or money laundering limits!"
	gold_warn.add_theme_font_size_override("font_size", 10)
	gold_warn.add_theme_color_override("font_color", Color(0.55, 0.55, 0.65, 0.85))
	gold_warn.position = Vector2(16, 198)
	gold_warn.size = Vector2(560, 48)
	gold_warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(gold_warn)

	# Buy/Sell Buttons
	var g_buy = Button.new()
	g_buy.text = "✔  ACQUIRE GOLD BARS"
	g_buy.position = Vector2(16, 274)
	g_buy.size = Vector2(260, 44)
	g_buy.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45, 1.0))
	g_buy.pressed.connect(func(): _execute_gold_trade("BUY", gold_qty))
	left.add_child(g_buy)

	var g_sell = Button.new()
	g_sell.text = "✕  LIQUIDATE GOLD BARS"
	g_sell.position = Vector2(310, 274)
	g_sell.size = Vector2(260, 44)
	g_sell.add_theme_color_override("font_color", Color(1.0, 0.7, 0.2, 1.0))
	g_sell.pressed.connect(func(): _execute_gold_trade("SELL", gold_qty))
	left.add_child(g_sell)

	# Right Column: Advertising / PR campaigns
	var right = _panel(Vector2(640, 16), Vector2(596, 432), Color(0.06, 0.05, 0.09, 0.95), Color(0.65, 0.45, 1.0, 0.3))
	view.add_child(right)

	var m_lbl = Label.new()
	m_lbl.text = "📢  MARKETING CAMPAIGNS  —  REPUTATION INJECTIONS"
	m_lbl.add_theme_font_size_override("font_size", 12)
	m_lbl.add_theme_color_override("font_color", Color(0.85, 0.6, 1.0, 1.0))
	m_lbl.position = Vector2(16, 16)
	right.add_child(m_lbl)

	var md_lbl = Label.new()
	md_lbl.text = "Fund temporary ad campaigns to massively spike corporate reputation scores. This temporarily increases credit loan limits and brand dealership access."
	md_lbl.add_theme_font_size_override("font_size", 11)
	md_lbl.add_theme_color_override("font_color", Color(0.6, 0.55, 0.7, 0.9))
	md_lbl.position = Vector2(16, 44)
	md_lbl.size = Vector2(560, 40)
	md_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(md_lbl)

	# PR Catalog cards
	var campaigns = [
		["LOCAL ADVERTISING TIER", "Cost: $10,000", "+100 Rep boost (Duration: 30m)", "LOCAL"],
		["NATIONAL PR BLITZ", "Cost: $35,000", "+250 Rep boost (Duration: 1h)", "NATIONAL"],
		["GLOBAL BRAND SPONSORSHIP", "Cost: $80,000", "+600 Rep boost (Duration: 2h)", "GLOBAL"]
	]

	var my = 96
	for camp in campaigns:
		var card = _panel(Vector2(16, my), Vector2(560, 68), Color(0.09, 0.08, 0.13, 0.9), Color(0.65, 0.45, 1.0, 0.2))
		right.add_child(card)

		var c_t = Label.new()
		c_t.text = camp[0]
		c_t.add_theme_font_size_override("font_size", 12)
		c_t.add_theme_color_override("font_color", Color(0.85, 0.6, 1.0, 1.0))
		c_t.position = Vector2(14, 10)
		card.add_child(c_t)

		var c_c = Label.new()
		c_c.text = "%s  ·  %s" % [camp[1], camp[2]]
		c_c.add_theme_font_size_override("font_size", 10)
		c_c.add_theme_color_override("font_color", Color(0.55, 0.55, 0.65, 1.0))
		c_c.position = Vector2(14, 30)
		card.add_child(c_c)

		var c_btn = Button.new()
		c_btn.text = "FUND"
		c_btn.position = Vector2(450, 14)
		c_btn.size = Vector2(90, 36)
		c_btn.pressed.connect(func(): _fund_marketing_campaign(camp[3]))
		card.add_child(c_btn)

		my += 78

func _execute_gold_trade(action_type: String, amount_oz: float) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "action": action_type, "amountOunces": amount_oz })

	action_http.request(BASE_URL + "/gold/trade", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Transacting gold bullion trade...", Color(0.9, 0.8, 0.2, 1.0))

func _fund_marketing_campaign(tier: String) -> void:
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({ "campaignTier": tier })

	action_http.request(BASE_URL + "/marketing", headers, HTTPClient.METHOD_POST, body)
	_show_toast("Commissioning marketing campaign...", Color(0.85, 0.6, 1.0, 1.0))

# ====================================================
# WS SIGNALS
# ====================================================
func _on_ws_gold_update(payload: Dictionary) -> void:
	var gold = payload.get("goldPrice", 2000.0)
	var c500 = market_data.get("c500Index", 1000.0)
	_update_ticker_text(c500, gold)
	if active_tab == Tab.SPECS:
		_switch_tab(Tab.SPECS) # refresh list

func _on_ws_c500_update(payload: Dictionary) -> void:
	var c500 = payload.get("c500Index", 1000.0)
	var gold = market_data.get("goldPrice", 2000.0)
	_update_ticker_text(c500, gold)

func _on_ws_balance_update(_payload: Dictionary) -> void:
	_update_balances_on_strip()

# ====================================================
# HELPERS & WRAPPER HANDLERS
# ====================================================
func _launch_ipo() -> void:
	var token = GameState.auth_token
	var headers = ["Authorization: Bearer " + token]
	ipo_http.request(BASE_URL + "/ipo", headers, HTTPClient.METHOD_POST, "")
	_show_toast("Submitting audited books for C500 IPO...", Color(0.8, 0.7, 1.0, 1.0))

func _on_ipo_response(_r, code, _h, body) -> void:
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		var msg = parsed.get("message", "IPO Launched successfully!")
		_show_toast("✔ " + msg, Color(0.2, 0.9, 0.5, 1.0))
		_fetch_all_data()
	else:
		var err = parsed.get("error", "UNKNOWN") if parsed else "SERVER_ERROR"
		var msg_map = {
			"REQUIREMENTS_NOT_MET": "Requirements not met. Build capital and complete more runs first."
		}
		_show_toast("✕ IPO Rejected: " + msg_map.get(err, err), Color(1.0, 0.25, 0.25, 1.0))

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

func _panel(pos: Vector2, sz: Vector2, col: Color, b_col: Color = Color(0.18, 0.12, 0.28, 0.6)) -> PanelContainer:
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
	b.add_theme_color_override("font_color", Color(0.95, 0.85, 0.4, 1.0)) # Financial Amber font color
	
	var sb_normal = StyleBoxFlat.new()
	sb_normal.bg_color = Color(0.08, 0.07, 0.05, 0.6)
	sb_normal.border_color = Color(0.95, 0.7, 0.15, 0.3)
	sb_normal.set_border_width_all(1)
	sb_normal.set_corner_radius_all(4)
	
	var sb_hover = StyleBoxFlat.new()
	sb_hover.bg_color = Color(0.14, 0.11, 0.08, 0.8)
	sb_hover.border_color = Color(0.95, 0.7, 0.15, 0.6)
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
		sb_normal.bg_color = Color(accent_col.r * 0.15, accent_col.g * 0.15, accent_col.b * 0.15, 0.8)
		sb_normal.border_color = accent_col
		sb_normal.border_width_left = 2; sb_normal.border_width_bottom = 2
		sb_normal.border_width_right = 2; sb_normal.border_width_top = 2
		
		sb_hover.bg_color = Color(accent_col.r * 0.25, accent_col.g * 0.25, accent_col.b * 0.25, 0.9)
		sb_hover.border_color = accent_col
		sb_hover.border_width_left = 2; sb_hover.border_width_bottom = 2
		sb_hover.border_width_right = 2; sb_hover.border_width_top = 2
	else:
		sb_normal.bg_color = Color(0.06, 0.06, 0.08, 0.6)
		sb_normal.border_color = Color(0.15, 0.2, 0.28, 0.4)
		sb_normal.border_width_left = 1; sb_normal.border_width_bottom = 1
		sb_normal.border_width_right = 1; sb_normal.border_width_top = 1
		
		sb_hover.bg_color = Color(0.08, 0.09, 0.12, 0.8)
		sb_hover.border_color = Color(accent_col.r, accent_col.g, accent_col.b, 0.5)
		sb_hover.border_width_left = 1; sb_hover.border_width_bottom = 1
		sb_hover.border_width_right = 1; sb_hover.border_width_top = 1
		
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
