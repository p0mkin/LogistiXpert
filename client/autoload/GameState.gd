extends Node

# Player Statistics & Currencies
var player_id: String = "debug_op"
var username: String = "DISPATCH_OPERATOR"
var legal_balance: float = 124897.95
var black_market_balance: float = 24500.00
var reputation_score: int = 150 # 150 / 20.0 = 7.5 stars rating
var _police_heat: int = 25
var police_heat: int:
	get: return _police_heat
	set(v): _police_heat = clamp(v, 0, 100)

# Company Profile
var company_id: String = "debug_company"
var company_name: String = "Underworld Logistics Ltd"

# Fleet & Asset Telemetry
var garages: Array = []
var fleet: Array = [
	{
		"id": "truck_moose",
		"model": "Moose FH16 Globetrotter",
		"vin": "MSFH16G924873105",
		"engineHealth": 92,
		"tireWear": 84,
		"mileage": 124850.0,
		"fuelTankMod": "STOCK",
		"scannerShielding": 2,
		"manufacturer": "MOOSE",
		"cabType": "GLOBETROTTER",
		"payloadType": "DRY",
		"tuningTier": "STAGE_1",
		"activeRoute": null,
		"isImpounded": false
	},
	{
		"id": "truck_scarfia",
		"model": "Scarfia R500",
		"vin": "SCAR500R38491027",
		"engineHealth": 88,
		"tireWear": 91,
		"mileage": 85200.0,
		"fuelTankMod": "FALSE_BOTTOM",
		"scannerShielding": 3,
		"manufacturer": "SCARFIA",
		"cabType": "HIGHLINE",
		"payloadType": "REEFER",
		"tuningTier": "STAGE_2",
		"activeRoute": null,
		"isImpounded": false
	}
]
var active_routes: Dictionary = {} # truckId -> route details
var drivers: Array = []

# Auth token alias (mirrors NetworkManager.auth_token for convenience in scenes)
var auth_token: String:
	get: return NetworkManager.auth_token

# Signals emitted on state synchronization
signal balance_updated(legal_cash, dirty_cash)
signal reputation_updated(score, heat)
signal fleet_updated()
signal route_progress_updated(truck_id, progress)
signal company_updated(id, name)

func _ready() -> void:
	pass

func sync_user_data(data: Dictionary) -> void:
	if data.has("id"): player_id = data.id
	if data.has("username"): username = data.username
	if data.has("legalBalance"): legal_balance = float(data.legalBalance)
	if data.has("blackMarketBalance"): black_market_balance = float(data.blackMarketBalance)
	if data.has("reputation"): reputation_score = int(data.reputation)
	if data.has("heat"): police_heat = int(data.heat)
	if data.has("companyId"): company_id = data.companyId
	if data.has("companyName"): company_name = data.companyName
	
	balance_updated.emit(legal_balance, black_market_balance)
	reputation_updated.emit(reputation_score, police_heat)
	company_updated.emit(company_id, company_name)

func update_balances(legal_diff: float, black_diff: float) -> void:
	legal_balance += legal_diff
	black_market_balance += black_diff
	balance_updated.emit(legal_balance, black_market_balance)

# Graphics settings supporting standard battery-saver and flagship OLED/PC modes
var graphics_quality: String = "STANDARD" # "STANDARD" or "ULTRA_HD"
signal graphics_settings_changed(new_quality: String)

func set_graphics_quality(quality: String) -> void:
	if quality in ["STANDARD", "ULTRA_HD"]:
		graphics_quality = quality
		graphics_settings_changed.emit(graphics_quality)

# Simulated Game Clock & Calendar Scale (5 real seconds = 1 simulated hour)
var simulated_time_unix: float = 1780287120.0 # Starts June 1, 2026 04:12:00
const TIME_SPEED_MULTIPLIER: float = 720.0 # 1 real second = 720 simulated seconds (12 mins)

func _process(delta: float) -> void:
	simulated_time_unix += delta * TIME_SPEED_MULTIPLIER

func get_simulated_time_string() -> String:
	var dt = Time.get_datetime_dict_from_unix_time(int(simulated_time_unix))
	var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
	var month_str = months[dt.month - 1] if dt.month >= 1 and dt.month <= 12 else "UNK"
	var weekday_names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
	var weekday_str = weekday_names[dt.weekday] if dt.weekday >= 0 and dt.weekday < 7 else "UNK"
	return "%s, %02d %s %d  %02d:%02d" % [
		weekday_str,
		dt.day,
		month_str,
		dt.year,
		dt.hour,
		dt.minute
	]
