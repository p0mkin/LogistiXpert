extends CanvasLayer
class_name ChopShop

var panel: PanelContainer
var upgrades_container: VBoxContainer
var status_label: Label
var truck_selector: OptionButton
var available_trucks: Array = []
var get_req: HTTPRequest
var post_req: HTTPRequest
var stats_vbox: VBoxContainer

func _ready() -> void:
    self.layer = 90
    
    panel = PanelContainer.new()
    panel.custom_minimum_size = Vector2(800, 550)
    panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
    add_child(panel)
    
    var style = StyleBoxFlat.new()
    style.bg_color = Color(0.05, 0.05, 0.08, 0.98)
    style.border_color = Color(0.9, 0.2, 0.2, 0.8)
    style.border_width_all = 3
    style.set_corner_radius_all(12)
    panel.add_theme_stylebox_override("panel", style)
    
    var vbox = VBoxContainer.new()
    panel.add_child(vbox)
    
    var header = Label.new()
    header.text = "🔧 THE CHOP SHOP (Underworld Customization)"
    header.add_theme_font_size_override("font_size", 22)
    header.add_theme_color_override("font_color", Color(0.9, 0.2, 0.2))
    header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vbox.add_child(header)
    
    status_label = Label.new()
    status_label.text = "Loading fleet data..."
    status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vbox.add_child(status_label)
    
    var selector_box = HBoxContainer.new()
    selector_box.alignment = BoxContainer.ALIGNMENT_CENTER
    vbox.add_child(selector_box)
    
    var sel_lbl = Label.new()
    sel_lbl.text = "Target Truck: "
    selector_box.add_child(sel_lbl)
    
    truck_selector = OptionButton.new()
    truck_selector.custom_minimum_size = Vector2(300, 30)
    selector_box.add_child(truck_selector)
    
    truck_selector.item_selected.connect(func(idx):
        _update_stats_comparison()
    )
    
    var content_hbox = HBoxContainer.new()
    content_hbox.add_theme_constant_override("separation", 20)
    content_hbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
    vbox.add_child(content_hbox)
    
    var scroll = ScrollContainer.new()
    scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
    content_hbox.add_child(scroll)
    
    upgrades_container = VBoxContainer.new()
    upgrades_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.add_child(upgrades_container)
    
    # Right panel: Stats comparison chart
    var stats_panel = PanelContainer.new()
    stats_panel.name = "StatsPanel"
    stats_panel.custom_minimum_size = Vector2(280, 0)
    var st_glass = StyleBoxFlat.new()
    st_glass.bg_color = Color(0.08, 0.08, 0.1, 0.7)
    st_glass.border_color = Color(0.9, 0.2, 0.2, 0.3)
    st_glass.border_width_all = 1
    st_glass.set_corner_radius_all(6)
    stats_panel.add_theme_stylebox_override("panel", st_glass)
    content_hbox.add_child(stats_panel)
    
    stats_vbox = VBoxContainer.new()
    stats_vbox.name = "StatsVBox"
    stats_vbox.add_theme_constant_override("separation", 10)
    stats_panel.add_child(stats_vbox)
    
    var close_btn = Button.new()
    close_btn.text = "CLOSE"
    close_btn.custom_minimum_size = Vector2(200, 40)
    close_btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
    close_btn.pressed.connect(queue_free)
    vbox.add_child(close_btn)
    
    # Network Setup
    get_req = HTTPRequest.new()
    add_child(get_req)
    get_req.request_completed.connect(_on_fleet_loaded)
    
    post_req = HTTPRequest.new()
    add_child(post_req)
    post_req.request_completed.connect(_on_upgrade_purchased)
    
    _fetch_fleet()

func _fetch_fleet() -> void:
    var token = NetworkManager.jwt_token
    var headers = ["Authorization: Bearer " + token]
    var url = NetworkManager.HTTP_URL + "/garage"
    get_req.request(url, headers, HTTPClient.METHOD_GET)

func _on_fleet_loaded(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
    if response_code != 200:
        status_label.text = "Failed to load fleet (Error %d)" % response_code
        status_label.add_theme_color_override("font_color", Color.RED)
        return
        
    var json = JSON.parse_string(body.get_string_from_utf8())
    available_trucks.clear()
    truck_selector.clear()
    
    for g in json:
        for t in g.trucks:
            available_trucks.append(t)
            truck_selector.add_item("%s (%s)" % [t.model, t.vin.substr(0,6)])
            
    if available_trucks.size() > 0:
        status_label.text = "Select a truck to upgrade."
        status_label.add_theme_color_override("font_color", Color.GREEN)
        _render_upgrades()
        _update_stats_comparison()
    else:
        status_label.text = "You own no trucks."
        status_label.add_theme_color_override("font_color", Color.RED)

func _render_upgrades() -> void:
    for c in upgrades_container.get_children():
        c.queue_free()
        
    var upgrades = [
        {"id": "V8_ENGINE", "name": "V8 Twin-Turbo Engine", "desc": "+20% Speed, +15% Fuel Consumption", "cost": "C500 15,000", "color": Color(0.9, 0.4, 0.2)},
        {"id": "REINFORCED_TIRES", "name": "All-Weather Reinforced Tires", "desc": "Ignores Storm & Fog Penalties", "cost": "C500 8,500", "color": Color(0.2, 0.7, 0.9)},
        {"id": "LEAD_COMPARTMENT", "name": "Lead-Lined Contraband Compartment", "desc": "Bypasses Border Scanners & Police", "cost": "C500 45,000", "color": Color(0.5, 0.2, 0.9)},
        {"id": "RADAR_SCRAMBLER", "name": "Police Radar Scrambler", "desc": "Alerts before hitting Police Blockades", "cost": "C500 22,000", "color": Color(0.9, 0.8, 0.2)}
    ]
    
    for u in upgrades:
        var card = PanelContainer.new()
        var st = StyleBoxFlat.new()
        st.bg_color = Color(0.1, 0.1, 0.1, 0.8)
        st.border_color = u.color
        st.border_width_left = 6
        card.add_theme_stylebox_override("panel", st)
        card.mouse_filter = Control.MOUSE_FILTER_STOP
        card.mouse_entered.connect(_update_stats_comparison.bind(u.id))
        card.mouse_exited.connect(_update_stats_comparison.bind(""))
        upgrades_container.add_child(card)
        
        var hb = HBoxContainer.new()
        card.add_child(hb)
        
        var info = Label.new()
        info.text = "%s\n%s" % [u.name, u.desc]
        info.add_theme_font_size_override("font_size", 14)
        info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
        hb.add_child(info)
        
        var buy_btn = Button.new()
        buy_btn.text = "INSTALL (%s)" % u.cost
        buy_btn.add_theme_color_override("font_color", u.color)
        buy_btn.custom_minimum_size = Vector2(200, 40)
        buy_btn.pressed.connect(_buy_upgrade.bind(u.id, buy_btn))
        hb.add_child(buy_btn)

func _buy_upgrade(upgrade_id: String, btn: Button) -> void:
    if truck_selector.selected < 0:
        return
        
    var truck_id = available_trucks[truck_selector.selected].id
    
    btn.text = "INSTALLING..."
    btn.disabled = true
    
    var token = NetworkManager.jwt_token
    var headers = ["Authorization: Bearer " + token, "Content-Type: application/json"]
    var url = NetworkManager.HTTP_URL + "/garage/upgrade"
    
    var body = JSON.stringify({
        "truckId": truck_id,
        "upgradeType": upgrade_id
    })
    post_req.request(url, headers, HTTPClient.METHOD_POST, body)

func _on_upgrade_purchased(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
    var json_str = body.get_string_from_utf8()
    var parsed = JSON.parse_string(json_str)
    
    if response_code == 200:
        status_label.text = "Upgrade Successfully Installed!"
        status_label.add_theme_color_override("font_color", Color(0.2, 0.9, 0.3))
    else:
        var msg = "Purchase Failed"
        if parsed and parsed.has("message"):
            msg = parsed.message
        status_label.text = "ERROR: " + msg
        status_label.add_theme_color_override("font_color", Color.RED)
    
    # Reload fleet to refresh buttons
    _fetch_fleet()

func _update_stats_comparison(hover_upgrade_id: String = "") -> void:
    if not stats_vbox: return
    
    for c in stats_vbox.get_children():
        c.queue_free()
        
    var title = Label.new()
    title.text = "📊  PERFORMANCE COMP"
    title.add_theme_font_size_override("font_size", 13)
    title.add_theme_color_override("font_color", Color(0.9, 0.2, 0.2))
    stats_vbox.add_child(title)
    
    if truck_selector.selected < 0 or available_trucks.is_empty():
        var empty_lbl = Label.new()
        empty_lbl.text = "Select a truck to see specs."
        empty_lbl.add_theme_font_size_override("font_size", 11)
        empty_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5))
        stats_vbox.add_child(empty_lbl)
        return
        
    var truck = available_trucks[truck_selector.selected]
    
    var has_v8 = truck.get("hasV8Engine", false)
    var has_tires = truck.get("hasReinforcedTires", false)
    var has_lead = truck.get("hasLeadLinedCompartment", false)
    var has_scrambler = truck.get("hasRadarScrambler", false)
    
    var speed_before = 100 + (20 if has_v8 else 0)
    var speed_after = speed_before
    if hover_upgrade_id == "V8_ENGINE" and not has_v8:
        speed_after += 20
        
    var fuel_before = 100 - (15 if has_v8 else 0)
    var fuel_after = fuel_before
    if hover_upgrade_id == "V8_ENGINE" and not has_v8:
        fuel_after -= 15
        
    var weather_before = 100 + (30 if has_tires else 0)
    var weather_after = weather_before
    if hover_upgrade_id == "REINFORCED_TIRES" and not has_tires:
        weather_after += 30
        
    var stealth_before = 0 + (100 if has_lead else 0)
    var stealth_after = stealth_before
    if hover_upgrade_id == "LEAD_COMPARTMENT" and not has_lead:
        stealth_after += 100
        
    var radar_before = 0 + (100 if has_scrambler else 0)
    var radar_after = radar_before
    if hover_upgrade_id == "RADAR_SCRAMBLER" and not has_scrambler:
        radar_after += 100

    _add_stat_comparison_bar("TOP SPEED", speed_before, speed_after, 150)
    _add_stat_comparison_bar("FUEL ECO", fuel_before, fuel_after, 150)
    _add_stat_comparison_bar("WEATHER RESIL", weather_before, weather_after, 150)
    _add_stat_comparison_bar("STEALTH (CONTRABAND)", stealth_before, stealth_after, 100)
    _add_stat_comparison_bar("RADAR SPOOF", radar_before, radar_after, 100)

func _add_stat_comparison_bar(stat_name: String, before: float, after: float, max_val: float) -> void:
    var vbox = VBoxContainer.new()
    vbox.add_theme_constant_override("separation", 2)
    stats_vbox.add_child(vbox)
    
    var lbl = Label.new()
    lbl.text = stat_name
    lbl.add_theme_font_size_override("font_size", 10)
    lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.6))
    vbox.add_child(lbl)
    
    var bars_hbox = HBoxContainer.new()
    bars_hbox.add_theme_constant_override("separation", 6)
    vbox.add_child(bars_hbox)
    
    var bar_now = ProgressBar.new()
    bar_now.min_value = 0
    bar_now.max_value = max_val
    bar_now.value = before
    bar_now.show_percentage = false
    bar_now.custom_minimum_size.y = 8
    bar_now.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    var st_now = StyleBoxFlat.new()
    st_now.bg_color = Color(0.9, 0.2, 0.2, 0.7)
    st_now.set_corner_radius_all(3)
    bar_now.add_theme_stylebox_override("fill", st_now)
    var bg_style = StyleBoxFlat.new()
    bg_style.bg_color = Color(0.05, 0.05, 0.07, 1.0)
    bg_style.set_corner_radius_all(3)
    bar_now.add_theme_stylebox_override("background", bg_style)
    bars_hbox.add_child(bar_now)
    
    var bar_next = ProgressBar.new()
    bar_next.min_value = 0
    bar_next.max_value = max_val
    bar_next.value = after
    bar_next.show_percentage = false
    bar_next.custom_minimum_size.y = 8
    bar_next.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    
    var st_next = StyleBoxFlat.new()
    if after > before:
        st_next.bg_color = Color(0.180, 0.803, 0.443)
    elif after < before:
        st_next.bg_color = Color(0.95, 0.75, 0.15)
    else:
        st_next.bg_color = Color(0.4, 0.4, 0.45)
        
    st_next.set_corner_radius_all(3)
    bar_next.add_theme_stylebox_override("fill", st_next)
    bar_next.add_theme_stylebox_override("background", bg_style)
    bars_hbox.add_child(bar_next)
    
    var val_lbl = Label.new()
    if before != after:
        val_lbl.text = "%.0f ➔ %.0f" % [before, after]
        val_lbl.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443) if after > before else Color(0.95, 0.75, 0.15))
    else:
        val_lbl.text = "%.0f" % before
        val_lbl.add_theme_color_override("font_color", Color(1, 1, 1, 0.85))
    val_lbl.add_theme_font_size_override("font_size", 9)
    val_lbl.custom_minimum_size.x = 45
    val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
    bars_hbox.add_child(val_lbl)
