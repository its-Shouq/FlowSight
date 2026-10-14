from pathlib import Path
from flask import Flask, render_template, request, jsonify
import pandas as pd

from src.model import load_model, predict_visitors
from src.event_engine import event_context
from src.decision_engine import assess_risk, explain_risk, recommend_action
from src.simulation import simulate_network
from src.demo_data import BASE_ZONE_STATES, ADJACENCY, ZONE_COORDS

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, template_folder="templates", static_folder="static")
model = load_model(ROOT/"models"/"crowd_model.pkl")
events = pd.read_csv(ROOT/"data"/"prototype_event_schedule.csv").to_dict("records")

def prepare_states(current_time="17:45"):
    states = {}
    hh, mm = map(int, current_time.split(":"))
    hour_decimal = hh + mm/60
    for z, base in BASE_ZONE_STATES.items():
        s = dict(base)
        s["hour"] = hour_decimal
        ctx = event_context(z, current_time, events, ADJACENCY)
        s.update({
            "event_nearby":ctx["event_nearby"],
            "minutes_to_event":ctx["minutes_to_event"],
            "event_expected_attendance":ctx["event_expected_attendance"],
            "event_pressure_index":ctx["event_pressure_index"],
            "_event_ctx":ctx,
        })
        states[z] = s
    return states

def serialize_network(states):
    payload = {}
    for z,s in states.items():
        p = predict_visitors(s, model)
        payload[z] = {
            "zone":z,
            "current":s["current_visitors"],
            "capacity":s["capacity"],
            "incoming":round(s["incoming_rate"],1),
            "outgoing":round(s["outgoing_rate"],1),
            "predicted":round(p),
            "occupancy_now":round(s["current_visitors"]/s["capacity"]*100),
            "occupancy_future":round(p/s["capacity"]*100),
            "risk":assess_risk(p,s["capacity"]),
            "x":ZONE_COORDS[z][0],
            "y":ZONE_COORDS[z][1],
        }
    return payload

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/state")
def api_state():
    current_time = request.args.get("time","17:45")
    states = prepare_states(current_time)
    network = serialize_network(states)

    # Next scheduled event
    now_m = int(current_time[:2])*60 + int(current_time[3:])
    upcoming = []
    for e in events:
        h,m = map(int,e["start_time"].split(":"))
        diff = h*60+m-now_m
        if diff >= 0:
            upcoming.append((diff,e))
    upcoming.sort(key=lambda x:x[0])
    next_event = upcoming[0][1] if upcoming else None
    next_event_in = upcoming[0][0] if upcoming else None

    elevated = sum(v["risk"] in ("High Risk","Critical") for v in network.values())
    highest = max(network.values(), key=lambda v:v["occupancy_future"])

    return jsonify({
        "time":current_time,
        "zones":network,
        "elevated_count":elevated,
        "highest_zone":highest["zone"],
        "highest_future_occupancy":highest["occupancy_future"],
        "next_event":next_event,
        "next_event_in":next_event_in,
        "adjacency":ADJACENCY,
    })

@app.route("/api/zone/<zone>")
def api_zone(zone):
    current_time = request.args.get("time","17:45")
    zone = zone.upper()
    states = prepare_states(current_time)
    s = states[zone]
    p = predict_visitors(s, model)
    risk = assess_risk(p,s["capacity"])
    reasons = explain_risk(s,p,s["_event_ctx"]["schedule_reasons"])
    rec = recommend_action(zone,s,p,states,ADJACENCY)

    return jsonify({
        "zone":zone,
        "current":s["current_visitors"],
        "capacity":s["capacity"],
        "incoming":round(s["incoming_rate"],1),
        "outgoing":round(s["outgoing_rate"],1),
        "predicted":round(p),
        "occupancy_now":round(s["current_visitors"]/s["capacity"]*100),
        "occupancy_future":round(p/s["capacity"]*100),
        "risk":risk,
        "reasons":reasons,
        "recommendation":rec,
        "event":s["_event_ctx"]["primary_event"],
        "neighbors":ADJACENCY[zone],
    })

@app.route("/api/simulate", methods=["POST"])
def api_simulate():
    body = request.get_json(force=True)
    current_time = body.get("time","17:45")
    zone = body.get("zone","B").upper()
    action_type = body.get("action_type","none")
    params = body.get("params",{})
    states = prepare_states(current_time)
    sim = simulate_network(zone,action_type,params,states,model)

    out = {}
    for z,r in sim["results"].items():
        out[z] = {
            "before":round(r["before"]),
            "after":round(r["after"]),
            "before_risk":r["before_risk"],
            "after_risk":r["after_risk"],
            "capacity":r["capacity"],
            "current":r["current"],
            "before_pct":round(r["before"]/r["capacity"]*100),
            "after_pct":round(r["after"]/r["capacity"]*100),
            "x":ZONE_COORDS[z][0],
            "y":ZONE_COORDS[z][1],
        }
    return jsonify({"zone":zone,"action_type":action_type,"params":params,"results":out})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
