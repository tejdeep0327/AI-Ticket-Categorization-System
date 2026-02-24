import os
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import LabelEncoder

# ----------------------------
# Paths
# ----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
data_path = os.path.join(BASE_DIR, "data", "preprocessed_dataset.csv")
models_dir = os.path.join(BASE_DIR, "models")

os.makedirs(models_dir, exist_ok=True)

category_model_path = os.path.join(models_dir, "category_model.pkl")
category_conf_model_path = os.path.join(models_dir, "category_conf_model.pkl")
priority_model_path = os.path.join(models_dir, "priority_model.pkl")
vectorizer_path = os.path.join(models_dir, "vectorizer.pkl")
category_encoder_path = os.path.join(models_dir, "category_label_encoder.pkl")
priority_encoder_path = os.path.join(models_dir, "priority_label_encoder.pkl")

# ----------------------------
# Load Dataset
# ----------------------------
df = pd.read_csv(data_path)
df = df.dropna(subset=["clean_text", "type", "priority"]).copy()

X = df["clean_text"]

category_encoder = LabelEncoder()
priority_encoder = LabelEncoder()

y_category = category_encoder.fit_transform(df["type"].astype(str))
y_priority = priority_encoder.fit_transform(df["priority"].astype(str))

# ----------------------------
# Stratified Train-Test Split
# ----------------------------
X_train, X_test, y_cat_train, y_cat_test, y_pri_train, y_pri_test = train_test_split(
    X,
    y_category,
    y_priority,
    test_size=0.2,
    random_state=42,
    stratify=y_category  # important for imbalance
)

# ----------------------------
# Improved TF-IDF (word + char)
# ----------------------------
vectorizer = FeatureUnion([
    (
        "word_tfidf",
        TfidfVectorizer(
            ngram_range=(1, 2),      # word unigrams + bigrams
            sublinear_tf=True,
            min_df=1                 # keep rare but useful support terms
        )
    ),
    (
        "char_tfidf",
        TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(3, 6),      # robust to typos/variants
            sublinear_tf=True,
            min_df=1
        )
    )
])

X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

# ----------------------------
# Improved Category Model
# ----------------------------
category_model = LinearSVC(
    C=2.3,
    class_weight="balanced"
)

category_model.fit(X_train_vec, y_cat_train)

cat_pred = category_model.predict(X_test_vec)

print("\n📊 IMPROVED CATEGORY MODEL")
print("Accuracy:", accuracy_score(y_cat_test, cat_pred))
print(classification_report(y_cat_test, cat_pred))

# Confidence calibrator (used only for better probability/confidence display)
category_conf_model = CalibratedClassifierCV(
    estimator=LinearSVC(C=2.3, class_weight="balanced"),
    method="sigmoid",
    cv=3
)
category_conf_model.fit(X_train_vec, y_cat_train)

# ----------------------------
# Improved Priority Model
# ----------------------------
priority_model = LogisticRegression(
    max_iter=2000,
    class_weight="balanced",
    C=1.2
)

priority_model.fit(X_train_vec, y_pri_train)

pri_pred = priority_model.predict(X_test_vec)

print("\n📊 IMPROVED PRIORITY MODEL")
print("Accuracy:", accuracy_score(y_pri_test, pri_pred))
print(classification_report(y_pri_test, pri_pred))

# ----------------------------
# Save Models
# ----------------------------
joblib.dump(category_model, category_model_path)
joblib.dump(category_conf_model, category_conf_model_path)
joblib.dump(priority_model, priority_model_path)
joblib.dump(vectorizer, vectorizer_path)
joblib.dump(category_encoder, category_encoder_path)
joblib.dump(priority_encoder, priority_encoder_path)

print("\n✅ Improved models trained and saved successfully!")
