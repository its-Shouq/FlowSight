def assess_risk(predicted, capacity):
    ratio = predicted / max(capacity,1)
    if ratio < .70: return "Normal"
    if ratio < .90: return "Watch"
    if ratio < 1.00: return "High Risk"
    return "Critical"

def explain_risk(state, predicted, schedule_reasons=None):
    reasons = list(schedule_reasons or [])
    incoming = float(state["incoming_rate"])
    outgoing = float(state["outgoing_rate"])
    baseline = max(float(state["baseline_incoming_rate"]),1)
    occ = state["current_visitors"] / max(state["capacity"],1)

    if (incoming-baseline)/baseline >= .15:
        reasons.append({
            "type":"inflow",
            "title":f"Incoming flow is {(incoming-baseline)/baseline:.0%} above baseline",
            "detail":f"{incoming:.0f}/min entering vs {baseline:.0f}/min typical"
        })
    if incoming > outgoing:
        reasons.append({
            "type":"imbalance",
            "title":f"Net inflow +{incoming-outgoing:.0f}/min",
            "detail":"Visitors are entering faster than leaving"
        })
    if occ >= .72:
        reasons.append({
            "type":"occupancy",
            "title":f"Current occupancy {occ:.0%}",
            "detail":"The zone has limited remaining buffer"
        })
    if state.get("route_disruption",0):
        reasons.append({
            "type":"route",
            "title":"Route disruption detected",
            "detail":"Normal outflow capacity is reduced"
        })
    if predicted > state["capacity"]:
        reasons.append({
            "type":"forecast",
            "title":f"Forecast exceeds capacity by {predicted-state['capacity']:.0f}",
            "detail":"Without action, the zone is expected to cross its safe limit"
        })
    return reasons[:5]

def recommend_action(zone, state, predicted, zone_states, adjacency):
    risk = assess_risk(predicted, state["capacity"])
    if risk in ("Normal","Watch"):
        return {"type":"none","label":"Continue monitoring","reason":"No action is needed yet.","params":{}}

    if state.get("route_disruption",0):
        return {
            "type":"open_route","label":"Activate alternate route",
            "reason":"Restore outflow before diverting more visitors.",
            "params":{"outflow_boost_pct":35}
        }

    ranked = []
    for z in adjacency[zone]:
        s = zone_states[z]
        spare = max(0, .88*s["capacity"] - s["current_visitors"])
        ranked.append((spare,z))
    ranked.sort(reverse=True)

    if ranked and ranked[0][0] > 120:
        spare,target = ranked[0]
        desired = .88*state["capacity"]
        reduction = max(0,predicted-desired)
        effective_in = max(state["incoming_rate"]*15 + .04*state.get("event_expected_attendance",0),1)
        frac = max(.15,min(.55,reduction/effective_in))
        frac = min(frac,spare/effective_in)
        frac = max(.10,frac)
        return {
            "type":"redirect",
            "label":f"Redirect {round(frac*100)}% to Zone {target}",
            "reason":f"Zone {target} has the strongest safe spare capacity.",
            "params":{"target_zone":target,"redirect_pct":round(frac*100)}
        }

    if state.get("event_pressure_index",0)>.30:
        return {
            "type":"stagger_event","label":"Stagger event entry / release",
            "reason":"Event timing is the main congestion driver.",
            "params":{"pressure_reduction_pct":40}
        }

    return {
        "type":"meter_entry","label":"Temporarily meter incoming flow",
        "reason":"No connected zone can absorb enough flow safely.",
        "params":{"meter_pct":30}
    }
