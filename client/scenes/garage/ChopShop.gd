extends CanvasLayer
class_name ChopShop

var panel: PanelContainer
var upgrades_container: VBoxContainer
var status_label: Label
var truck_selector: OptionButton
var available_trucks: Array = []
var get_req: HTTPRequest
var post_req: HTTPRequest

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
    
    var scroll = ScrollContainer.new()
    scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
    vbox.add_child(scroll)
    
    upgrades_container = VBoxContainer.new()
    upgrades_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.add_child(upgrades_container)
    
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
    var url = "http://" + NetworkManager.SERVER_HOST + ":" + str(NetworkManager.SERVER_PORT) + "/api/garage"
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
    var url = "http://" + NetworkManager.SERVER_HOST + ":" + str(NetworkManager.SERVER_PORT) + "/api/garage/upgrade"
    
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
