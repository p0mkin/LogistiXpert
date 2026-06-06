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

# Employee / Staff Mechanics
const STAFF_RANK_MULTIPLIERS = {
	1: -0.25, # Apprentice: Actively harms operations
	2: 0.20,  # Junior: Slight bonus
	3: 0.50,  # Senior: Solid bonus
	4: 0.85,  # Expert: High bonus
	5: 1.25   # LogistiXpert/Master: Maximum potential
}

var staff = {
	"purchasing_agent": {
		"name": "Purchasing Agent",
		"desc": "Automates buying and secures discounts on market prices.",
		"unlocked": true,
		"rank": 1,
		"seminar_level": 1,
		"base_value": 5.0 # Base 5% discount
	},
	"lead_mechanic": {
		"name": "Lead Mechanic",
		"desc": "Speeds up fleet repairs and reduces maintenance costs.",
		"unlocked": false,
		"rank": 1,
		"seminar_level": 1,
		"base_value": 10.0 # Base 10% speed
	},
	"router": {
		"name": "LogistiXpert",
		"desc": "Auto-assigns trucks to optimal routes for max profit.",
		"unlocked": false,
		"rank": 1,
		"seminar_level": 1,
		"base_value": 15.0 # Base 15% profit boost
	}
}

func get_employee_bonus(role_id: String) -> float:
	if not staff.has(role_id): return 0.0
	var emp = staff[role_id]
	if not emp.unlocked: return 0.0
	var multiplier = STAFF_RANK_MULTIPLIERS.get(emp.rank, 0.0)
	return emp.base_value * multiplier

func purchase_seminar(role_id: String, cost: float) -> bool:
	if legal_balance >= cost:
		update_balances(-cost, 0.0)
		staff[role_id].seminar_level += 1
		# Base value scales linearly with seminar level
		if role_id == "purchasing_agent": staff[role_id].base_value = 5.0 * staff[role_id].seminar_level
		elif role_id == "lead_mechanic": staff[role_id].base_value = 10.0 * staff[role_id].seminar_level
		elif role_id == "router": staff[role_id].base_value = 15.0 * staff[role_id].seminar_level
		staff_updated.emit(role_id)
		return true
	return false

func promote_staff(role_id: String, cost: float) -> bool:
	if legal_balance >= cost and staff[role_id].rank < 5:
		update_balances(-cost, 0.0)
		staff[role_id].rank += 1
		staff_updated.emit(role_id)
		return true
	return false

# Auth token alias (mirrors NetworkManager.auth_token for convenience in scenes)
var auth_token: String:
	get: return NetworkManager.auth_token

# Signals emitted on state synchronization
signal balance_updated(legal_cash, dirty_cash)
signal reputation_updated(score, heat)
signal fleet_updated()
signal route_progress_updated(truck_id, progress)
signal company_updated(id, name)
signal staff_updated(role_id)
signal time_synced(unix_time, season)
signal season_changed(new_season)

var current_season: String = "SUMMER"

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

# Simulated Game Clock & Calendar Scale
var simulated_time_unix: float = 1780287120.0
const TIME_SPEED_MULTIPLIER: float = 720.0

func _process(delta: float) -> void:
	simulated_time_unix += delta * TIME_SPEED_MULTIPLIER

func sync_time(unix_time: float, season: String) -> void:
	# Keep Godot clock in lockstep with the server
	simulated_time_unix = unix_time
	
	if current_season != season:
		current_season = season
		season_changed.emit(current_season)
		
	time_synced.emit(simulated_time_unix, current_season)

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
