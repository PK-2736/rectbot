FROM python:3.10-slim

WORKDIR /app

# 依存パッケージのインストール
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# アプリ本体をコピー
COPY . ./

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]