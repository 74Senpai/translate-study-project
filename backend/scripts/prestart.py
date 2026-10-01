import spacy
from spacy.cli import download

try:
    nlp = spacy.load("en_core_web_sm")
except:
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

try:
    import nltk
    from nltk.tokenize import sent_tokenize
    text = "Hello world. How are you? Everything is fine."
    print(sent_tokenize(text))
except:
    import nltk
    nltk.download('punkt')
    nltk.download('punkt_tab')
    from nltk.tokenize import sent_tokenize
    text = "Hello world. How are you? Everything is fine."
    print(sent_tokenize(text))
