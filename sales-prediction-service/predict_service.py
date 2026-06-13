from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from xgboost import XGBRegressor
import traceback
import os

app = Flask(__name__)

MIN_MONTHS_REQUIRED = 12
MIN_MONTHS_FOR_XGB = 18
MAX_HORIZON = 12
DEFAULT_HORIZON = 3
LAG_WINDOW = 12

ENABLE_CV = os.getenv("ENABLE_CV", "false").lower() == "true"


def clip_outliers_iqr(series, factor=1.5):
    s = np.array(series, dtype=float)
    non_zero = s[s > 0]
    if len(non_zero) < 4:
        return s
    q1 = np.percentile(non_zero, 25)
    q3 = np.percentile(non_zero, 75)
    iqr = q3 - q1
    upper = q3 + factor * iqr
    lower = max(0.0, q1 - factor * iqr)
    return np.clip(s, lower, upper)


def create_features(series, window=LAG_WINDOW):
    data = []
    for i in range(window, len(series)):
        row = {}
        for lag in range(1, window + 1):
            row[f"lag_{lag}"] = series[i - lag]

        row["mean_3"] = float(np.mean(series[max(0, i - 3):i]))
        row["mean_6"] = float(np.mean(series[max(0, i - 6):i]))
        row["mean_12"] = float(np.mean(series[max(0, i - 12):i]))
        row["std_6"] = float(np.std(series[max(0, i - 6):i]))

        row["trend"] = i
        row["month_idx"] = i % 12
        row["yoy_ratio"] = (
            float(series[i - 1] / series[i - 13])
            if i - 13 >= 0 and series[i - 13] > 0
            else 1.0
        )

        row["target"] = series[i]
        data.append(row)
    return pd.DataFrame(data)


def get_fast_hyperparams(n_samples):
    if n_samples < 30:
        return {
            "n_estimators": 50,
            "learning_rate": 0.1,
            "max_depth": 3,
            "subsample": 0.9,
            "colsample_bytree": 0.9,
            "reg_alpha": 0.1,
            "reg_lambda": 1.0,
            "tree_method": "hist",
            "n_jobs": 1,
        }
    elif n_samples < 60:
        return {
            "n_estimators": 80,
            "learning_rate": 0.08,
            "max_depth": 4,
            "subsample": 0.85,
            "colsample_bytree": 0.85,
            "reg_alpha": 0.05,
            "reg_lambda": 0.8,
            "tree_method": "hist",
            "n_jobs": 1,
        }
    else:
        return {
            "n_estimators": 120,
            "learning_rate": 0.07,
            "max_depth": 5,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "reg_alpha": 0.01,
            "reg_lambda": 0.5,
            "tree_method": "hist",
            "n_jobs": 1,
        }


def build_features_for_prediction(history):
    features = {}
    for lag in range(1, LAG_WINDOW + 1):
        features[f"lag_{lag}"] = history[-lag] if len(history) >= lag else 0.0

    features["mean_3"] = float(np.mean(history[-3:])) if len(history) >= 3 else float(np.mean(history))
    features["mean_6"] = float(np.mean(history[-6:])) if len(history) >= 6 else float(np.mean(history))
    features["mean_12"] = float(np.mean(history[-12:])) if len(history) >= 12 else float(np.mean(history))
    features["std_6"] = float(np.std(history[-6:])) if len(history) >= 6 else 0.0

    features["trend"] = len(history)
    features["month_idx"] = len(history) % 12
    features["yoy_ratio"] = (
        float(history[-1] / history[-13])
        if len(history) >= 13 and history[-13] > 0
        else 1.0
    )

    return features


def time_series_cv_mae(series, n_splits=2):
    n = len(series)
    if n < 24:
        return None

    test_size = max(3, n // 10)
    maes = []

    for split in range(n_splits):
        end_train = n - test_size * (n_splits - split)
        if end_train < LAG_WINDOW + 6:
            continue

        train = series[:end_train]
        test = series[end_train:end_train + test_size]

        try:
            df_train = create_features(train)
            if len(df_train) < 5:
                continue
            X_train = df_train.drop(columns=["target"])
            y_train = df_train["target"]

            params = get_fast_hyperparams(len(train))
            model = XGBRegressor(objective="reg:squarederror", verbosity=0, **params)
            model.fit(X_train, y_train)

            history = list(train)
            preds = []
            for _ in range(len(test)):
                features = build_features_for_prediction(history)
                X_pred = pd.DataFrame([features])
                pred = float(model.predict(X_pred)[0])
                pred = max(0, pred)
                preds.append(pred)
                history.append(pred)

            mae = float(np.mean(np.abs(np.array(test) - np.array(preds))))
            maes.append(mae)
        except Exception:
            continue

    return float(np.mean(maes)) if maes else None


def forecast_xgboost(series, horizon=3):
    series_clean = clip_outliers_iqr(series)
    df = create_features(series_clean)

    if len(df) < 5:
        return None, None

    X = df.drop(columns=["target"])
    y = df["target"]

    params = get_fast_hyperparams(len(series_clean))
    model = XGBRegressor(objective="reg:squarederror", verbosity=0, **params)
    model.fit(X, y)

    feature_importance = dict(zip(X.columns, model.feature_importances_.tolist()))
    top_features = dict(
        sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:5]
    )

    history = list(series_clean)
    predictions = []
    for _ in range(horizon):
        features = build_features_for_prediction(history)
        X_pred = pd.DataFrame([features])
        pred = float(model.predict(X_pred)[0])
        pred = max(0, pred)
        predictions.append(pred)
        history.append(pred)

    return predictions, top_features


def fallback_seasonal_trend(series, horizon=3, growth_yoy=0.10):
    s = clip_outliers_iqr(series)
    n = len(s)

    last_3 = float(np.mean(s[-3:])) if n >= 3 else float(np.mean(s))
    last_6 = float(np.mean(s[-6:])) if n >= 6 else last_3
    last_12 = float(np.mean(s[-12:])) if n >= 12 else last_6

    x = np.arange(min(12, n), dtype=float)
    recent = s[-min(12, n):]
    if len(x) >= 2:
        slope = float(np.polyfit(x, recent, 1)[0])
    else:
        slope = 0.0

    forecast = []
    for h in range(1, horizon + 1):
        future_idx = n + (h - 1)
        yoy_idx = future_idx - 12

        if yoy_idx >= 0 and yoy_idx < n:
            seasonal = float(s[yoy_idx]) * (1.0 + growth_yoy)
            trend = last_3 + slope * h
            baseline = last_3 * 0.5 + last_6 * 0.3 + last_12 * 0.2
            yhat = seasonal * 0.55 + trend * 0.30 + baseline * 0.15
        else:
            trend = last_3 + slope * h
            baseline = last_3 * 0.6 + last_6 * 0.4
            yhat = trend * 0.65 + baseline * 0.35

        forecast.append(max(0.0, yhat))

    return forecast


def confidence_interval(predictions, mae):
    if mae is None or mae == 0:
        return None
    return [
        {
            "lower": max(0, p - 1.96 * mae),
            "upper": p + 1.96 * mae,
        }
        for p in predictions
    ]


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True)
        series_raw = data.get("series", [])
        horizon = data.get("horizon", DEFAULT_HORIZON)
        with_cv = data.get("with_cv", ENABLE_CV)

        if not isinstance(series_raw, list):
            return jsonify({"error": "series debe ser una lista"}), 400

        try:
            horizon = int(horizon)
        except (TypeError, ValueError):
            return jsonify({"error": "horizon debe ser numerico"}), 400

        if horizon < 1 or horizon > MAX_HORIZON:
            return jsonify({"error": f"horizon debe estar entre 1 y {MAX_HORIZON}"}), 400

        try:
            series = [float(v) if v is not None else 0.0 for v in series_raw]
        except (TypeError, ValueError):
            return jsonify({"error": "series contiene valores no numericos"}), 400

        if len(series) < MIN_MONTHS_REQUIRED:
            return jsonify({
                "error": f"Se requieren al menos {MIN_MONTHS_REQUIRED} meses",
                "received": len(series),
            }), 400

        if any(v < 0 for v in series):
            return jsonify({"error": "series contiene valores negativos"}), 400

        if sum(series) <= 0:
            return jsonify({"error": "Serie sin ventas"}), 400

        non_zero_count = sum(1 for v in series if v > 0)
        if non_zero_count < 4:
            return jsonify({"error": "Serie con muy pocas observaciones validas"}), 400

        method = "xgboost"
        forecast = None
        top_features = None
        mae = None

        if len(series) >= MIN_MONTHS_FOR_XGB:
            try:
                forecast, top_features = forecast_xgboost(series, horizon)
                if forecast is not None and with_cv:
                    mae = time_series_cv_mae(series)
            except Exception as e:
                print(f"XGBoost fallo, usando fallback: {e}", flush=True)
                forecast = None

        if forecast is None:
            method = "seasonal_trend_fallback"
            forecast = fallback_seasonal_trend(series, horizon)

        ci = confidence_interval(forecast, mae) if mae else None

        response = {
            "forecast": forecast,
            "method": method,
            "meta": {
                "input_length": len(series),
                "non_zero_months": non_zero_count,
                "horizon": horizon,
                "mae": round(mae, 2) if mae is not None else None,
                "confidence_interval_95": ci,
                "top_features": top_features,
            },
        }

        return jsonify(response)

    except Exception as e:
        print("Error en /predict:", flush=True)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "prediction",
        "engine": "xgboost",
        "cv_enabled": ENABLE_CV,
    }), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5007, threaded=True)