def _mins(hhmm):
    h, m = map(int, hhmm.split(":"))
    return h*60 + m

def event_context(zone, current_time, schedule, adjacency):
    now = _mins(current_time)
    reasons, best = [], None
    pressure, attendance, minutes_to_event, event_nearby = 0.0, 0, 999, 0

    for e in schedule:
        start, end = _mins(e["start_time"]), _mins(e["end_time"])
        att = int(e["expected_attendance"])

        if e["zone"] == zone and 0 <= start-now <= 30:
            mins = start-now
            p = (1-mins/31) * min(1.6, max(.15, att/1800))
            if p > pressure:
                pressure, attendance, minutes_to_event, event_nearby = p, att, mins, 1
                best = {**e, "phase":"starting", "minutes":mins}
            reasons.append({
                "type":"event_start",
                "title":f"{e['event_name']} starts in {mins} min",
                "detail":f"~{att:,} expected attendees in Zone {zone}"
            })

        if e["zone"] == zone and 0 <= end-now <= 15:
            mins = end-now
            p = .75*(1-mins/16) * min(1.6, max(.15, att/1800))
            if p > pressure:
                pressure, attendance, minutes_to_event, event_nearby = p, att, -max(1,mins), 1
                best = {**e, "phase":"ending", "minutes":mins}
            reasons.append({
                "type":"event_end",
                "title":f"{e['event_name']} ends in {mins} min",
                "detail":"A local exit surge is expected"
            })

        if e["zone"] in adjacency.get(zone,[]) and 0 <= end-now <= 15:
            mins = end-now
            p = .55*(1-mins/16) * min(1.6, max(.15, att/1800))
            if p > pressure:
                pressure, attendance, minutes_to_event, event_nearby = p, att, -max(1,mins), 1
                best = {**e, "phase":"neighbor_ending", "minutes":mins}
            reasons.append({
                "type":"spillover",
                "title":f"Zone {e['zone']} event ends in {mins} min",
                "detail":f"Spillover toward Zone {zone} is possible"
            })

    return {
        "event_nearby":event_nearby,
        "minutes_to_event":minutes_to_event,
        "event_expected_attendance":attendance,
        "event_pressure_index":float(pressure),
        "primary_event":best,
        "schedule_reasons":reasons[:4]
    }
