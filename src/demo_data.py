ZONE_COORDS = {
    "A": (120,105),
    "B": (300,85),
    "C": (205,225),
    "D": (390,220),
    "E": (95,355),
    "F": (315,365),
}
ADJACENCY = {
    "A":["B","C"],
    "B":["A","C","D"],
    "C":["A","B","D","E"],
    "D":["B","C","E","F"],
    "E":["C","D","F"],
    "F":["D","E"],
}
BASE_ZONE_STATES = {
    "A":{"current_visitors":430,"incoming_rate":15.0,"outgoing_rate":13.0,"baseline_incoming_rate":13.0,"capacity":800,"daily_load_factor":1.08,"hour":17.75,"nearby_zone_load":.62,"route_disruption":0},
    "B":{"current_visitors":700,"incoming_rate":29.0,"outgoing_rate":13.0,"baseline_incoming_rate":15.0,"capacity":950,"daily_load_factor":1.08,"hour":17.75,"nearby_zone_load":.66,"route_disruption":0},
    "C":{"current_visitors":680,"incoming_rate":32.0,"outgoing_rate":10.0,"baseline_incoming_rate":20.0,"capacity":900,"daily_load_factor":1.08,"hour":17.75,"nearby_zone_load":.74,"route_disruption":0},
    "D":{"current_visitors":590,"incoming_rate":18.0,"outgoing_rate":17.0,"baseline_incoming_rate":17.0,"capacity":1100,"daily_load_factor":1.08,"hour":17.75,"nearby_zone_load":.64,"route_disruption":0},
    "E":{"current_visitors":760,"incoming_rate":22.0,"outgoing_rate":14.0,"baseline_incoming_rate":17.0,"capacity":1000,"daily_load_factor":1.08,"hour":17.75,"nearby_zone_load":.91,"route_disruption":1},
    "F":{"current_visitors":350,"incoming_rate":11.0,"outgoing_rate":12.0,"baseline_incoming_rate":12.0,"capacity":900,"daily_load_factor":1.08,"hour":17.75,"nearby_zone_load":.45,"route_disruption":0},
}
