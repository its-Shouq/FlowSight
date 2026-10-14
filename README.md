# FlowSight

### Predict the crowd. Shape the flow.

FlowSight is a decision-support prototype designed for Expo Riyadh 2030 operations.

It helps operations teams anticipate crowd pressure 15 minutes ahead, understand why it is forming, test an intervention, and compare its impact before acting.

## Live Prototype

[Open FlowSight](https://flowsight-1.onrender.com)

## Challenge

**Track 3:** Exhibition Operations, Safety & Security  
**Challenge 3.1:** Early detection of crowd congestion.

## How FlowSight Works

1. Monitor the current crowd state.
2. Forecast crowd pressure 15 minutes ahead.
3. Explain the factors behind the predicted risk.
4. Recommend an operational intervention.
5. Simulate the intervention before applying it.

## Data

The prototype uses:

- Public Expo 2025 information as a real-world reference.
- Simulated operational data such as:
  - Crowd occupancy
  - Entry and exit rates
  - Event schedules
  - Zone capacity
  - Nearby-zone load
  - Route status

Granular Expo 2030 operational data was not available to the team.

In a real deployment, the simulated inputs would be replaced by live operational feeds.

## Technologies

- Python
- Flask
- HTML
- CSS
- JavaScript
- Scikit-learn

## Prototype Development

The team defined the problem, solution workflow, required data inputs, and user experience, then researched the feasibility of applying the concept in an Expo environment.

AI-assisted development tools were used to accelerate the creation of the functional prototype and simulated operational scenarios.

## Current Prototype Scope

This is a proof-of-concept designed to demonstrate the feasibility and end-to-end workflow of FlowSight.

## Future Development

- Connect to live Expo operational data.
- Retrain and validate the forecasting layer using real historical data.
- Pilot the system in selected zones.
- Integrate with the Expo Operations Center.

## Team

- Shouq Aljaber
- Wasan Alkhaldi
- Aleen Alqasim
