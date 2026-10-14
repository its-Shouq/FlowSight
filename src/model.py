from pathlib import Path
import joblib
import pandas as pd

FEATURE_COLUMNS = [
    "daily_load_factor","current_visitors","incoming_rate","outgoing_rate",
    "baseline_incoming_rate","capacity","occupancy_ratio","hour","event_nearby",
    "minutes_to_event","event_expected_attendance","event_pressure_index",
    "nearby_zone_load","route_disruption"
]

def load_model(path=None):
    if path is None:
        path = Path(__file__).resolve().parents[1] / "models" / "crowd_model.pkl"
    return joblib.load(path)

def predict_visitors(state, model):
    row = dict(state)
    row["occupancy_ratio"] = row["current_visitors"] / max(row["capacity"], 1)
    X = pd.DataFrame([{c: row[c] for c in FEATURE_COLUMNS}])
    return float(model.predict(X)[0])
