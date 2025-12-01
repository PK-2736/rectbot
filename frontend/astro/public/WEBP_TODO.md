# WebP画像の作成が必要

以下のコマンドで PNG を WebP に変換してください：

## 必要なツール
```bash
# ImageMagickまたはcwebpを使用
brew install webp  # macOS
# または
sudo apt-get install webp  # Linux
```

## 変換コマンド
```bash
cd frontend/astro/public
cwebp -q 85 image.png -o image.webp
cwebp -q 85 logo.png -o logo.webp
```

変換後、このファイル（WEBP_TODO.md）は削除してください。
