import os
import joblib
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ----------------------------
# Initialize Flask App
# ----------------------------
app = Flask(__name__)
CORS(app)

# ----------------------------
# Paths
# ----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
models_dir = os.path.join(BASE_DIR, "models")

category_model_path = os.path.join(models_dir, "category_model.pkl")
category_conf_model_path = os.path.join(models_dir, "category_conf_model.pkl")
priority_model_path = os.path.join(models_dir, "priority_model.pkl")
vectorizer_path = os.path.join(models_dir, "vectorizer.pkl")
category_encoder_path = os.path.join(models_dir, "category_label_encoder.pkl")
priority_encoder_path = os.path.join(models_dir, "priority_label_encoder.pkl")

# ----------------------------
# Load Models & Encoders
# ----------------------------
try:
    category_model = joblib.load(category_model_path)
    category_conf_model = joblib.load(category_conf_model_path) if os.path.exists(category_conf_model_path) else None
    priority_model = joblib.load(priority_model_path)
    vectorizer = joblib.load(vectorizer_path)
    category_encoder = joblib.load(category_encoder_path)
    priority_encoder = joblib.load(priority_encoder_path)
    print("✅ Models loaded successfully!")
except Exception as e:
    print("❌ Error loading models:", e)
    raise RuntimeError("Model startup failed. Retrain models and encoders, then restart service.") from e


# ----------------------------
# Business Category Mapping
# ----------------------------
CATEGORY_MAP = {
    "problem": "Technical",
    "incident": "Technical",
    "request": "General",
    "question": "General",
    "hardware": "Hardware",
    "software": "Technical",
    "billing": "Billing"
}


# ----------------------------
# Smart Category Override
# ----------------------------
def smart_category_override(text, current_category):
    text = text.lower()

    billing_keywords = [
        "refund", "payment", "charged", "billing", "invoice",
        "money", "transaction", "subscription", "deducted",
        "amount", "paid"
    ]

    account_keywords = [
        "login", "password", "otp", "signin",
        "verification", "account locked", "cannot access account"
    ]

    hardware_keywords = [
        "laptop", "keyboard", "screen", "battery",
        "mouse", "charger", "device not turning on"
    ]

    feature_keywords = [
        "feature", "suggestion", "enhancement", "add option",
        "improve", "dark mode"
    ]

    if any(w in text for w in billing_keywords):
        return "Billing"

    if any(w in text for w in account_keywords):
        return "Account"

    if any(w in text for w in hardware_keywords):
        return "Hardware"

    if any(w in text for w in feature_keywords):
        return "Feature Request"

    return current_category


# ----------------------------
# Smart Priority Override
# ----------------------------
def smart_priority_override(text, current_priority):
    text = text.lower()

    urgent_keywords = [
        "urgent", "immediately", "asap",
        "critical", "emergency",
        "not working", "server down",
        "system down", "blocked",
        "quickly", "as soon as possible",
        "production down", "outage", "shutdown",
        "shut down", "cannot access", "can't access"
    ]

    high_billing_keywords = [
        "wrong amount", "overcharged",
        "charged twice", "duplicate charge",
        "payment failed", "debited twice"
    ]

    finance_keywords = [
        "refund", "payment", "finance", "billing", "invoice",
        "money", "transaction", "subscription", "deducted",
        "amount", "paid", "charge", "charged", "wallet",
        "reimbursement", "payout"
    ]

    medium_keywords = [
        "unable to login", "login fails", "otp delay",
        "disconnect", "timeout", "not received",
        "failed", "error", "issue", "cannot login",
        "can't login", "overheating", "fan issue",
        "refund pending"
    ]

    # Force High if urgent words found
    if any(w in text for w in urgent_keywords):
        return "High"

    # Billing escalation logic
    if any(w in text for w in high_billing_keywords):
        return "High"

    # Finance/billing requests should not remain Low
    if any(w in text for w in finance_keywords) and current_priority == "Low":
        return "Medium"

    # Reduce false-low predictions for obvious service issues
    if current_priority == "Low" and any(w in text for w in medium_keywords):
        return "Medium"

    return current_priority


def max_confidence_from_model(model, vec):
    """
    Returns confidence in [0, 1] for the predicted class.
    Works for both probabilistic and margin-based linear models.
    """
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(vec)
        return float(np.max(probs[0]))

    scores = model.decision_function(vec)
    scores = np.asarray(scores)

    # Binary linear models may return shape (n_samples,)
    if scores.ndim == 1:
        s = float(scores[0])
        p = 1.0 / (1.0 + np.exp(-s))
        return float(max(p, 1.0 - p))

    # Multi-class: softmax over class scores
    logits = scores[0]
    logits = logits - np.max(logits)
    exp_logits = np.exp(logits)
    probs = exp_logits / np.sum(exp_logits)
    return float(np.max(probs))


def category_confidence_for_label(conf_model, encoder, vec, label):
    """
    Use calibrated probabilities for display confidence of the predicted label.
    Falls back to None when unavailable.
    """
    if conf_model is None or not hasattr(conf_model, "predict_proba"):
        return None
    probs = conf_model.predict_proba(vec)[0]
    class_to_prob = {
        str(cls): float(prob) for cls, prob in zip(encoder.classes_, probs)
    }
    return class_to_prob.get(str(label))


def predict_with_scores(model, encoder, vec):
    """
    Predict label + per-class scores (probabilities when available).
    Returns: (label: str, confidence: float, class_scores: dict[str, float])
    """
    pred_idx = model.predict(vec)[0]
    label = encoder.inverse_transform([pred_idx])[0]

    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(vec)[0]
        class_scores = {
            str(cls): float(prob) for cls, prob in zip(encoder.classes_, probs)
        }
        return label, float(np.max(probs)), class_scores

    scores = model.decision_function(vec)
    scores = np.asarray(scores)

    if scores.ndim == 1:
        s = float(scores[0])
        p = 1.0 / (1.0 + np.exp(-s))
        # Binary fallback, mapped to predicted class confidence
        conf = float(max(p, 1.0 - p))
        return label, conf, {str(label): conf}

    logits = scores[0]
    logits = logits - np.max(logits)
    exp_logits = np.exp(logits)
    probs = exp_logits / np.sum(exp_logits)
    class_scores = {
        str(cls): float(prob) for cls, prob in zip(encoder.classes_, probs)
    }
    return label, float(np.max(probs)), class_scores


def smart_priority_borderline_adjust(current_priority, class_scores):
    """
    If Low vs Medium is too close, prefer Medium to reduce false-low outcomes.
    """
    if current_priority != "Low":
        return current_priority

    low_score = float(class_scores.get("Low", 0.0))
    medium_score = float(class_scores.get("Medium", 0.0))
    if medium_score > 0 and (low_score - medium_score) <= 0.10:
        return "Medium"
    return current_priority


# ----------------------------
# Home Route
# ----------------------------
@app.route("/")
def home():
    return "🚀 AI Ticket ML Service Running Successfully"


# ----------------------------
# Prediction Route
# ----------------------------
@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()

        if not data or "description" not in data:
            return jsonify({"error": "Description field is required"}), 400

        description = data["description"].strip()

        if not description:
            return jsonify({"error": "Description cannot be empty"}), 400

        # Vectorize
        vec = vectorizer.transform([description])

        # ---------------- CATEGORY ----------------
        category_raw, cat_confidence, _ = predict_with_scores(category_model, category_encoder, vec)
        calibrated_cat_conf = category_confidence_for_label(category_conf_model, category_encoder, vec, category_raw)
        if calibrated_cat_conf is not None:
            cat_confidence = calibrated_cat_conf

        category_key = category_raw.strip().lower()
        display_category = CATEGORY_MAP.get(category_key, category_raw)

        # Apply category override
        overridden_category = smart_category_override(description, display_category)
        category_overridden = overridden_category != display_category
        display_category = overridden_category

        # ---------------- PRIORITY ----------------
        priority_raw, pri_confidence, pri_scores = predict_with_scores(priority_model, priority_encoder, vec)

        # Apply priority override
        overridden_priority = smart_priority_override(description, priority_raw)
        override_by_keywords = overridden_priority != priority_raw
        overridden_priority = smart_priority_borderline_adjust(overridden_priority, pri_scores)
        priority_overridden = overridden_priority != priority_raw
        display_priority = overridden_priority
        if override_by_keywords:
            priority_reason = "Rule-based escalation from issue keywords"
        elif priority_overridden:
            priority_reason = "Model borderline adjusted to reduce false-low"
        else:
            priority_reason = "Model prediction"

        # ---------------- RESPONSE ----------------
        return jsonify({
            "category": display_category,
            "category_confidence": f"{cat_confidence * 100:.2f}%",
            "priority": display_priority,
            "priority_confidence": f"{pri_confidence * 100:.2f}%",
            "category_overridden": category_overridden,
            "priority_overridden": priority_overridden,
            "priority_reason": priority_reason
        })

    except Exception as e:
        print("Prediction error:", e)
        return jsonify({"error": "Prediction failed"}), 500


# ----------------------------
# Run App
# ----------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
