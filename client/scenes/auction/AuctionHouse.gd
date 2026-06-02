extends Control

# ==========================================
# LIVE AUCTION HOUSE
# Real-time WebSocket bidding on trucks.
# Redis Lua atomic bids prevent race conditions.
# Countdown timers per listing, outbid alerts,
# and a bid history feed panel.
# ==========================================

@onready var back_btn: Button = %BackBtn
@onready var player_lbl: Label = %PlayerLabel
@onready var balance_lbl: Label = %BalanceLabel
@onready var dirty_lbl: Label = %DirtyLabel
@onready var listing_list: VBoxContainer = %ListingList
@onready var bid_panel: PanelContainer = %BidPanel
@onready var bid_truck_lbl: Label = %BidTruckLabel
@onready var bid_current_lbl: Label = %BidCurrentLabel
@onready var bid_timer_lbl: Label = %BidTimerLabel
@onready var bid_input: LineEdit = %BidInput
@onready var place_bid_btn: Button = %PlaceBidBtn
@onready var bid_history: VBoxContainer = %BidHistory
@onready var console_lbl: Label = %ConsoleLabel
@onready var filter_all_btn: Button = %FilterAllBtn
@onready var filter_mine_btn: Button = %FilterMineBtn

var api_base: String:
	get: return NetworkManager.HTTP_URL
var all_listings: Array = []
var selected_listing: Dictionary = {}
var countdown_timer: float = 0.0
var filter_mode: String = "all"  # "all" or "mine"

func _ready() -> void:
	_apply_theme()
	player_lbl.text = GameState.username.to_upper()
	_refresh_balances()

	GameState.balance_updated.connect(_on_balances_updated)
	NetworkManager.auction_bid_received.connect(_on_bid_update)
	NetworkManager.auction_bid_resolved.connect(_on_bid_resolved)
	NetworkManager.ws_message_received.connect(_on_ws_packet)

	back_btn.pressed.connect(_on_back)
	place_bid_btn.pressed.connect(_on_place_bid)
	filter_all_btn.pressed.connect(_show_all_filter)
	filter_mine_btn.pressed.connect(_show_mine_filter)

	bid_panel.hide()
	_fetch_listings()
	set_process(true)

func _process(delta: float) -> void:
	if not selected_listing.is_empty() and bid_panel.visible:
		countdown_timer = max(0.0, countdown_timer - delta)
		var mins = int(countdown_timer) / 60
		var secs = int(countdown_timer) % 60
		if countdown_timer <= 0.0:
			bid_timer_lbl.text = "⏰ EXPIRED"
			bid_timer_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
		elif countdown_timer <= 30.0:
			bid_timer_lbl.text = "⚡ %02d:%02d" % [mins, secs]
			bid_timer_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
		else:
			bid_timer_lbl.text = "⏱ %02d:%02d" % [mins, secs]
			bid_timer_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))

# ==========================================
# API REQUESTS
# ==========================================
func _fetch_listings() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_listings_response.bind(http))
	http.request(
		api_base + "/auction",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _post_listing(truck_id: String, start_bid: float, currency: String) -> void:
	var body = JSON.stringify({
		"truckId": truck_id,
		"startingBid": start_bid,
		"currency": currency,
		"durationMinutes": 30
	})
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_post_listing_response.bind(http))
	http.request(
		api_base + "/auction",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

# ==========================================
# RESPONSE HANDLERS
# ==========================================
func _on_listings_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Array:
			all_listings = data
			_render_listings()
			_log("Auction block loaded: %d active listings." % all_listings.size(), Color(0.18, 0.803, 0.443))
	else:
		_log("Failed to fetch auction listings (HTTP %d)." % code, Color(0.901, 0.298, 0.235))

func _on_post_listing_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if code == 201:
		_log("Truck listed on auction block successfully.", Color(0.18, 0.803, 0.443))
		_fetch_listings()
	else:
		_log("Listing failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

# ==========================================
# RENDERING LISTINGS
# ==========================================
func _render_listings() -> void:
	for child in listing_list.get_children():
		child.queue_free()

	var display = all_listings
	if filter_mode == "mine":
		display = all_listings.filter(func(l): 
			return l.get("sellerCompanyId", "") == GameState.company_id or l.get("sellerId", "") == GameState.player_id
		)

	if display.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "No active listings. Be the first to post a truck."
		empty_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
		empty_lbl.add_theme_font_size_override("font_size", 12)
		listing_list.add_child(empty_lbl)
		return

	for listing in display:
		var card = _build_listing_card(listing)
		listing_list.add_child(card)

func _build_listing_card(listing: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	var is_my_listing = listing.get("sellerCompanyId", "") == GameState.company_id or listing.get("sellerId", "") == GameState.player_id
	var currency = listing.get("currency", "LEGAL")
	
	var border_col: Color
	if is_my_listing:
		border_col = Color(0.95, 0.75, 0.15, 0.6)  # Glowing Financial Amber
	elif currency == "LEGAL":
		border_col = Color(0.2, 0.9, 0.7, 0.4)     # Glowing Cyber Cyan
	else:
		border_col = Color(0.65, 0.45, 1.0, 0.4)    # Glowing Underworld Purple
		
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.04, 0.06, 0.85) # Glassmorphic
	style.border_color = border_col
	style.border_width_left = 3
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)
	panel.custom_minimum_size.x = 480

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 5)
	panel.add_child(vbox)

	# Truck model + my listing badge
	var header = HBoxContainer.new()
	var truck = listing.get("truck", {})
	var model_lbl = Label.new()
	model_lbl.text = truck.get("model", "Unknown Truck")
	model_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	model_lbl.add_theme_font_size_override("font_size", 15)
	header.add_child(model_lbl)

	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)

	if is_my_listing:
		var own_lbl = Label.new()
		own_lbl.text = "★ YOUR LISTING"
		own_lbl.add_theme_color_override("font_color", Color(0.95, 0.75, 0.15))
		own_lbl.add_theme_font_size_override("font_size", 11)
		header.add_child(own_lbl)
	vbox.add_child(header)

	# VIN + mileage
	var sub_lbl = Label.new()
	sub_lbl.text = "VIN: %s  |  %.0f km  |  Engine: %d%%  |  Tires: %d%%" % [
		truck.get("vin", "???"),
		truck.get("mileage", 0),
		int(truck.get("engineHealth", 0)),
		int(truck.get("tireWear", 0))
	]
	sub_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 0.6))
	sub_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(sub_lbl)

	# Rigging badge
	var mod = truck.get("fuelTankMod", "STOCK")
	if mod != "STOCK":
		var rig_lbl = Label.new()
		rig_lbl.text = "⚠ RIGGED: " + mod
		rig_lbl.add_theme_color_override("font_color", Color(0.65, 0.45, 1.0))
		rig_lbl.add_theme_font_size_override("font_size", 11)
		vbox.add_child(rig_lbl)

	# Current bid + currency
	var bid_row = HBoxContainer.new()
	bid_row.add_theme_constant_override("separation", 16)

	var current_bid = float(listing.get("currentBid", listing.get("startingBid", 0)))
	var bid_color = Color(0.2, 0.9, 0.7) if currency == "LEGAL" else Color(0.65, 0.45, 1.0)

	var bid_lbl = Label.new()
	bid_lbl.text = ("$%.0f CLEAN" if currency == "LEGAL" else "$%.0f DIRTY") % current_bid
	bid_lbl.add_theme_color_override("font_color", bid_color)
	bid_lbl.add_theme_font_size_override("font_size", 14)
	bid_row.add_child(bid_lbl)

	# Bid count
	var count_lbl = Label.new()
	count_lbl.text = "%d bids" % int(listing.get("bidCount", 0))
	count_lbl.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 0.5))
	count_lbl.add_theme_font_size_override("font_size", 11)
	bid_row.add_child(count_lbl)
	vbox.add_child(bid_row)

	# Action button
	if not is_my_listing:
		var btn = Button.new()
		btn.text = "⚡ PLACE BID"
		btn.add_theme_font_size_override("font_size", 12)
		_style_btn(btn, Color(0.2, 0.9, 0.7) if currency == "LEGAL" else Color(0.65, 0.45, 1.0))
		btn.pressed.connect(_open_bid_panel.bind(listing))
		vbox.add_child(btn)

	return panel

# ==========================================
# BID PANEL
# ==========================================
func _open_bid_panel(listing: Dictionary) -> void:
	selected_listing = listing
	bid_panel.show()

	var truck = listing.get("truck", {})
	bid_truck_lbl.text = truck.get("model", "Unknown Truck")

	var current_bid = float(listing.get("currentBid", listing.get("startingBid", 0)))
	var currency = listing.get("currency", "LEGAL")
	bid_current_lbl.text = ("Current: $%.0f CLEAN" if currency == "LEGAL" else "Current: $%.0f DIRTY") % current_bid
	bid_current_lbl.add_theme_color_override("font_color",
		Color(0.2, 0.9, 0.7) if currency == "LEGAL" else Color(0.65, 0.45, 1.0)
	)

	# Calculate remaining time
	var expires_at = listing.get("expiresAt", "")
	if expires_at != "":
		var now = Time.get_unix_time_from_system()
		countdown_timer = max(0.0, float(listing.get("secondsRemaining", 300)))
	else:
		countdown_timer = 300.0  # default 5 min if no data

	# Dynamic Holographic Blueprint Preview
	var bid_inner = bid_truck_lbl.get_parent()
	var old_bp = bid_inner.get_node_or_null("AuctionBlueprint")
	if old_bp:
		old_bp.queue_free()
		bid_inner.remove_child(old_bp)

	var blueprint = VehicleBlueprint.new()
	blueprint.name = "AuctionBlueprint"
	blueprint.manufacturer = truck.get("manufacturer", "SCARFIA")
	blueprint.cab_type = truck.get("cabType", "STANDARD")
	blueprint.payload_type = truck.get("payloadType", "DRY")
	blueprint.tuning_tier = truck.get("tuningTier", "STOCK")
	blueprint.health_pct = int(truck.get("engineHealth", 100))
	blueprint.custom_minimum_size = Vector2(280, 110) # Compact, sleek blueprint size
	blueprint.size = blueprint.custom_minimum_size
	
	bid_inner.add_child(blueprint)
	var timer_idx = bid_timer_lbl.get_index()
	bid_inner.move_child(blueprint, timer_idx + 1)

	bid_input.text = "%.0f" % (current_bid + 100.0)
	bid_input.placeholder_text = "Enter bid amount..."

	# Clear and reload bid history
	for child in bid_history.get_children():
		child.queue_free()
	_load_bid_history(listing.get("id", ""))

func _load_bid_history(auction_id: String) -> void:
	if auction_id.is_empty():
		return
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result, code, headers, body):
		http.queue_free()
		if code == 200:
			var data = JSON.parse_string(body.get_string_from_utf8())
			if data is Array:
				for bid in data:
					_append_bid_history_entry(bid)
			elif data is Dictionary and data.has("bids"):
				for bid in data.bids:
					_append_bid_history_entry(bid)
	)
	http.request(
		api_base + "/auction/" + auction_id + "/bids",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _append_bid_history_entry(bid: Dictionary) -> void:
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)

	var bidder_lbl = Label.new()
	var bidder_name = bid.get("bidderUsername", "")
	if bidder_name.is_empty():
		bidder_name = bid.get("bidderCompanyName", "")
	if bidder_name.is_empty():
		var bc = bid.get("bidderCompany", {})
		if bc is Dictionary and bc.has("name"):
			bidder_name = bc.get("name", "")
	if bidder_name.is_empty():
		bidder_name = "???"

	bidder_lbl.text = bidder_name
	bidder_lbl.add_theme_font_size_override("font_size", 11)
	bidder_lbl.add_theme_color_override("font_color",
		Color(0.95, 0.75, 0.15) if (bidder_name == GameState.company_name or bidder_name == GameState.username) else Color(0.75, 0.75, 0.85, 0.7)
	)
	row.add_child(bidder_lbl)

	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)

	var amt_lbl = Label.new()
	amt_lbl.text = "$%.0f" % float(bid.get("amount", 0))
	amt_lbl.add_theme_font_size_override("font_size", 11)
	amt_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
	row.add_child(amt_lbl)

	bid_history.add_child(row)

# ==========================================
# WEBSOCKET LIVE BID EVENTS
# ==========================================
func _on_bid_update(payload: Dictionary) -> void:
	# Update current bid on matching listing in real time
	var auction_id = payload.get("auctionId", "")
	for listing in all_listings:
		if listing.get("id", "") == auction_id:
			listing["currentBid"] = payload.get("currentBid", listing["currentBid"])
			listing["bidCount"] = payload.get("totalBids", listing.get("bidCount", 0))
			if payload.has("highestBidderCompanyId"):
				listing["highestBidderCompanyId"] = payload.highestBidderCompanyId
			if payload.has("highestBidderCompanyName"):
				listing["highestBidderCompanyName"] = payload.highestBidderCompanyName
			break

	_render_listings()

	if not selected_listing.is_empty() and selected_listing.get("id", "") == auction_id:
		var current_bid = float(payload.get("currentBid", 0))
		var currency = selected_listing.get("currency", "LEGAL")
		bid_current_lbl.text = ("Current: $%.0f CLEAN" if currency == "LEGAL" else "Current: $%.0f DIRTY") % current_bid

		# Outbid alert
		var bidder_company_id = payload.get("highestBidderCompanyId", "")
		var bidder_name = payload.get("highestBidderCompanyName", payload.get("bidderUsername", "?"))

		if bidder_company_id != GameState.company_id:
			_log("New bid placed: $%.0f by %s" % [current_bid, bidder_name], Color(0.95, 0.75, 0.15))
		else:
			_log("✓ You placed a bid of $%.0f!" % current_bid, Color(0.2, 0.9, 0.7))

		_append_bid_history_entry({
			"bidderUsername": bidder_name,
			"amount": current_bid
		})

func _on_bid_resolved(success: bool, data: Dictionary) -> void:
	if success:
		_log("✓ Bid accepted! You are the current high bidder.", Color(0.2, 0.9, 0.7))
	else:
		_log("✗ Bid rejected: " + data.get("message", "Insufficient amount."), Color(1.0, 0.25, 0.25))

func _on_ws_packet(packet: Dictionary) -> void:
	match packet.get("type", ""):
		"auction:settled":
			var payload = packet.get("payload", {})
			var winner_company_id = payload.get("winnerCompanyId", "")
			var winner_name = payload.get("winnerCompanyName", payload.get("winnerUsername", ""))
			
			if winner_company_id == GameState.company_id or winner_name == GameState.username:
				_log("🏆 YOUR COMPANY WON the auction! Truck added to your fleet.", Color(0.2, 0.9, 0.7))
			else:
				_log("Auction settled. Winner: %s" % (winner_name if not winner_name.is_empty() else "Unsold"), Color(0.75, 0.75, 0.85))
			_fetch_listings()

# ==========================================
# ACTIONS
# ==========================================
func _on_place_bid() -> void:
	if selected_listing.is_empty():
		return

	var input_val = bid_input.text.strip_edges()
	if not input_val.is_valid_float():
		_log("Invalid bid amount entered.", Color(1.0, 0.25, 0.25))
		return

	var amount = float(input_val)
	var current_bid = float(selected_listing.get("currentBid", selected_listing.get("startingBid", 0)))
	if amount <= current_bid:
		_log("Bid must exceed current high bid of $%.0f." % current_bid, Color(1.0, 0.25, 0.25))
		return

	if countdown_timer <= 0.0:
		_log("This auction has expired.", Color(1.0, 0.25, 0.25))
		return

	_log("Submitting bid of $%.0f via secure channel..." % amount, Color(0.95, 0.75, 0.15))
	NetworkManager.send_bid(selected_listing.get("id", ""), amount)

func _show_all_filter() -> void:
	filter_mode = "all"
	filter_all_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
	filter_mine_btn.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 0.4))
	_render_listings()

func _show_mine_filter() -> void:
	filter_mode = "mine"
	filter_mine_btn.add_theme_color_override("font_color", Color(0.95, 0.75, 0.15))
	filter_all_btn.add_theme_color_override("font_color", Color(0.75, 0.75, 0.85, 0.4))
	_render_listings()

# ==========================================
# HELPERS
# ==========================================
func _refresh_balances() -> void:
	balance_lbl.text = "$%s CLEAN" % String.num(GameState.legal_balance, 2)
	dirty_lbl.text = "$%s DIRTY" % String.num(GameState.black_market_balance, 2)

func _on_balances_updated(legal: float, dirty: float) -> void:
	balance_lbl.text = "$%s CLEAN" % String.num(legal, 2)
	dirty_lbl.text = "$%s DIRTY" % String.num(dirty, 2)

func _log(text: String, color: Color) -> void:
	console_lbl.text = text
	console_lbl.add_theme_color_override("font_color", color)

func _on_back() -> void:
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _apply_theme() -> void:
	# 1. Remove old Background if exists
	for child in get_children():
		if child.name == "Background" or child.name == "BG" or child.name == "Bg" or child is ColorRect:
			child.queue_free()
	
	# 2. Add CyberGridBackground at index 0
	var bg = CyberGridBackground.new()
	bg.name = "CyberGridBackground"
	bg.primary_color = Color(0.95, 0.75, 0.15, 0.1) # Financial Amber marketplace tone
	bg.accent_color = Color(0.65, 0.45, 1.0, 0.08) # Underworld Purple secondary
	add_child(bg)
	move_child(bg, 0)
	
	# Style buttons
	_style_btn(back_btn, Color(1.0, 0.25, 0.25)) # Crimson back warning button
	_style_btn(place_bid_btn, Color(0.95, 0.75, 0.15)) # Amber bid placement
	_style_btn(filter_all_btn, Color(0.2, 0.9, 0.7)) # Cyber Cyan filters
	_style_btn(filter_mine_btn, Color(0.95, 0.75, 0.15)) # Amber filter
	
	# Style panels
	_style_panel(bid_panel, Color(0.05, 0.05, 0.08, 0.9), Color(0.95, 0.75, 0.15, 0.35))

func _style_btn(b: Button, accent_col: Color) -> void:
	var sb_normal = StyleBoxFlat.new()
	var sb_hover = StyleBoxFlat.new()
	var sb_pressed = StyleBoxFlat.new()
	var sb_disabled = StyleBoxFlat.new()
	
	sb_normal.bg_color = Color(accent_col.r * 0.06, accent_col.g * 0.06, accent_col.b * 0.06, 0.6)
	sb_normal.border_color = Color(accent_col.r, accent_col.g, accent_col.b, 0.3)
	sb_normal.set_border_width_all(1)
	sb_normal.set_corner_radius_all(4)
	
	sb_hover.bg_color = Color(accent_col.r * 0.12, accent_col.g * 0.12, accent_col.b * 0.12, 0.8)
	sb_hover.border_color = Color(accent_col.r, accent_col.g, accent_col.b, 0.6)
	sb_hover.set_border_width_all(1)
	sb_hover.set_corner_radius_all(4)
	
	sb_pressed.bg_color = Color(accent_col.r * 0.2, accent_col.g * 0.2, accent_col.b * 0.2, 0.9)
	sb_pressed.border_color = accent_col
	sb_pressed.set_border_width_all(2)
	sb_pressed.set_corner_radius_all(4)
	
	sb_disabled.bg_color = Color(0.04, 0.04, 0.05, 0.3)
	sb_disabled.border_color = Color(0.1, 0.1, 0.12, 0.2)
	sb_disabled.set_border_width_all(1)
	sb_disabled.set_corner_radius_all(4)
	
	b.add_theme_stylebox_override("normal", sb_normal)
	b.add_theme_stylebox_override("hover", sb_hover)
	b.add_theme_stylebox_override("pressed", sb_pressed)
	b.add_theme_stylebox_override("disabled", sb_disabled)
	b.add_theme_color_override("font_color", Color(accent_col.r * 0.9 + 0.1, accent_col.g * 0.9 + 0.1, accent_col.b * 0.9 + 0.1, 1.0))

func _style_panel(p: PanelContainer, bg_col: Color, border_col: Color) -> void:
	var s = StyleBoxFlat.new()
	var alpha_col = bg_col
	alpha_col.a = 0.85 # glassmorphic translucent
	s.bg_color = alpha_col
	s.border_color = border_col
	s.set_border_width_all(1)
	s.set_corner_radius_all(6)
	p.add_theme_stylebox_override("panel", s)

