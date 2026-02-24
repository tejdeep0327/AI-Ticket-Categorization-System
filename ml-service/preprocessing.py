import pandas as pd
import re
import nltk
import joblib
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from sklearn.preprocessing import LabelEncoder

# Download NLTK resources (run once)
nltk.download("stopwords")
nltk.download("wordnet")
nltk.download("omw-1.4")

# Load dataset
df = pd.read_csv("data/dataset.csv")


# Select required columns
df = df[["subject", "body", "type", "language"]]

# Filter only English tickets
df = df[df["language"] == "en"]

# Combine subject + body
df["text"] = df["subject"].fillna("") + " " + df["body"].fillna("")

# Remove missing & duplicates
df.dropna(subset=["text", "type"], inplace=True)
df.drop_duplicates(inplace=True)

# Initialize NLP tools
stop_words = set(stopwords.words("english"))
lemmatizer = WordNetLemmatizer()

# Text cleaning function
def preprocess_text(text):
    text = text.lower()
    
    # Remove URLs
    text = re.sub(r"http\S+", "", text)
    
    # Remove numbers
    text = re.sub(r"\d+", "", text)
    
    # Remove special characters
    text = re.sub(r"[^a-z\s]", "", text)
    
    # Remove extra spaces
    text = re.sub(r"\s+", " ", text).strip()
    
    # Tokenization
    words = text.split()
    
    # Remove stopwords + Lemmatization
    cleaned_words = [
        lemmatizer.lemmatize(word)
        for word in words
        if word not in stop_words
    ]
    
    return " ".join(cleaned_words)

# Apply preprocessing
df["clean_text"] = df["text"].apply(preprocess_text)

# Remove very short texts
df = df[df["clean_text"].str.split().apply(len) > 3]
 
#priority
def generate_priority(text):
    text = text.lower()

    if any(word in text for word in ["urgent", "immediately", "asap", "critical", "down", "not working"]):
        return "High"
    elif any(word in text for word in ["slow", "delay", "error", "issue"]):
        return "Medium"
    else:
        return "Low"

df["priority"] = df["clean_text"].apply(generate_priority)


# Encode category (type)
le = LabelEncoder()
df["type_encoded"] = le.fit_transform(df["type"])

# Save label encoder (IMPORTANT for prediction stage)
joblib.dump(le, "models/category_label_encoder.pkl")

#priority encoding
priority_encoder = LabelEncoder()
df["priority_encoded"] = priority_encoder.fit_transform(df["priority"])

joblib.dump(priority_encoder, "models/priority_label_encoder.pkl")


# Final dataset
final_df = df[[
    "text",
    "clean_text",
    "type",
    "type_encoded",
    "priority",
    "priority_encoded"
]]


# Save preprocessed data
final_df.to_csv("preprocessed_dataset.csv", index=False)

print("✅ Preprocessing completed successfully")
print("Final shape:", final_df.shape)
