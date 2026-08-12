"""
inspect_model.py — AgriPredict Model Inspector
===============================================
Run this script to inspect the trained ML model and label encoders.
It prints all metadata that future maintainers need to understand
the model's expected inputs and outputs.

Usage (from project root):
    cd backend
    .venv\\Scripts\\activate   # Windows
    python scripts/inspect_model.py
"""

import os
import sys
import joblib
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
MODEL_PATH = os.path.join(ROOT, "rice_pest_model.pkl")
ENCODER_PATH = os.path.join(ROOT, "label_encoders.pkl")


def sep(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print('=' * 60)


def inspect_model(path: str):
    sep("MODEL")
    print(f"Path       : {os.path.abspath(path)}")
    print(f"File size  : {os.path.getsize(path) / 1_048_576:.1f} MB")

    model = joblib.load(path)
    print(f"Class      : {model.__class__.__module__}.{model.__class__.__name__}")

    # sklearn / XGBoost pipeline or direct estimator
    if hasattr(model, "steps"):
        print("Type       : sklearn Pipeline")
        for name, step in model.steps:
            print(f"  Step '{name}': {step.__class__.__name__}")
        estimator = model.steps[-1][1]
    else:
        estimator = model

    # Feature names
    for attr in ("feature_names_in_", "feature_name_", "get_booster"):
        if attr == "get_booster" and hasattr(estimator, "get_booster"):
            try:
                booster = estimator.get_booster()
                fnames = booster.feature_names
                print(f"Feature names (XGBoost): {fnames}")
            except Exception as e:
                print(f"  [get_booster error: {e}]")
        elif hasattr(estimator, attr) and attr != "get_booster":
            print(f"{attr}: {getattr(estimator, attr)}")

    # n_features
    for attr in ("n_features_in_", "n_features_"):
        if hasattr(estimator, attr):
            print(f"n_features : {getattr(estimator, attr)}")

    # Classes
    for attr in ("classes_", "n_classes_"):
        if hasattr(estimator, attr):
            print(f"{attr}: {getattr(estimator, attr)}")

    return model


def inspect_encoders(path: str):
    sep("LABEL ENCODERS")
    print(f"Path       : {os.path.abspath(path)}")

    enc = joblib.load(path)
    print(f"Type       : {type(enc)}")

    if isinstance(enc, dict):
        for key, val in enc.items():
            print(f"\n  Encoder key: '{key}'")
            print(f"    Class      : {val.__class__.__name__}")
            if hasattr(val, "classes_"):
                print(f"    Classes    : {list(val.classes_)}")
            if hasattr(val, "categories_"):
                print(f"    Categories : {val.categories_}")
    elif hasattr(enc, "classes_"):
        print(f"Classes    : {list(enc.classes_)}")
    else:
        print(f"Value      : {enc}")

    return enc


def sample_prediction(model, label_encoder):
    sep("SAMPLE PREDICTION (synthetic input)")
    """
    Attempt a sample prediction with a plausible input vector.
    Adjust feature count / names based on what inspect_model() prints.
    """
    try:
        # Try a minimal numeric feature vector — adjust based on actual feature names
        sample = np.array([[28.5, 75.0, 1.2, 8.0]])  # temp, humidity, rainfall, wind

        if hasattr(model, "n_features_in_"):
            n = model.n_features_in_
            if n != sample.shape[1]:
                print(f"Model expects {n} features; adjusting sample vector...")
                sample = np.zeros((1, n))
                sample[0, :4] = [28.5, 75.0, 1.2, 8.0]  # fill known features

        pred = model.predict(sample)
        print(f"Raw prediction : {pred}")

        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(sample)
            print(f"Probabilities  : {proba}")
            print(f"Max proba      : {np.max(proba):.4f}")

        # Decode label
        if isinstance(label_encoder, dict):
            # Try 'pest' key or first key
            key = "pest" if "pest" in label_encoder else next(iter(label_encoder))
            enc = label_encoder[key]
            if hasattr(enc, "inverse_transform"):
                decoded = enc.inverse_transform(pred)
                print(f"Decoded label  : {decoded}")
        elif hasattr(label_encoder, "inverse_transform"):
            decoded = label_encoder.inverse_transform(pred)
            print(f"Decoded label  : {decoded}")

    except Exception as e:
        print(f"Sample prediction failed: {e}")
        print("(This is expected if the model needs encoded categorical features.)")
        print("Adjust the sample vector above once you know the feature schema.")


if __name__ == "__main__":
    for path, label in [(MODEL_PATH, "Model"), (ENCODER_PATH, "Encoder")]:
        if not os.path.exists(path):
            print(f"ERROR: {label} file not found at {os.path.abspath(path)}", file=sys.stderr)
            sys.exit(1)

    model = inspect_model(MODEL_PATH)
    label_encoder = inspect_encoders(ENCODER_PATH)
    sample_prediction(model, label_encoder)

    sep("DONE")
    print("Copy the feature names and class list above into main.py when wiring")
    print("model.predict() into predict_pest_logic().")
