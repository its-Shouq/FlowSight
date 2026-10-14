from copy import deepcopy
from .model import predict_visitors
from .decision_engine import assess_risk

def simulate_network(zone, action_type, params, zone_states, model):
    before_states = deepcopy(zone_states)
    after_states = deepcopy(zone_states)
    source = after_states[zone]

    if action_type == "redirect":
        pct = float(params.get("redirect_pct",25))/100
        target = params.get("target_zone")
        moved = source["incoming_rate"]*pct
        source["incoming_rate"] *= (1-pct)
        source["event_pressure_index"] *= (1-pct*.65)
        if target in after_states:
            after_states[target]["incoming_rate"] += moved

    elif action_type == "open_route":
        boost = float(params.get("outflow_boost_pct",30))/100
        source["route_disruption"] = 0
        source["outgoing_rate"] *= (1+boost)

    elif action_type == "stagger_event":
        red = float(params.get("pressure_reduction_pct",40))/100
        source["event_pressure_index"] *= (1-red)
        source["incoming_rate"] *= (1-.18*red)

    elif action_type == "meter_entry":
        meter = float(params.get("meter_pct",30))/100
        source["incoming_rate"] *= (1-meter)

    results = {}
    for z in zone_states:
        b = predict_visitors(before_states[z], model)
        a = predict_visitors(after_states[z], model)
        results[z] = {
            "before":b,"after":a,
            "before_risk":assess_risk(b,before_states[z]["capacity"]),
            "after_risk":assess_risk(a,after_states[z]["capacity"]),
            "capacity":before_states[z]["capacity"],
            "current":before_states[z]["current_visitors"]
        }
    return {"results":results,"before_states":before_states,"after_states":after_states}
