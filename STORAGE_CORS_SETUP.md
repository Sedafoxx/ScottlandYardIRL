# Firebase Storage CORS — one-time setup

The in-app photo download (and the Admin "Export results" zip) fetch photo **bytes** in the
browser to re-encode/watermark them. Firebase Storage blocks cross-origin `fetch()` until the
bucket has a CORS policy. Displaying photos via `<img>` works without this; reading their pixels
does not.

Apply `storage.cors.json` to the bucket **once**. Pick either option.

Bucket: `gs://scottlandyardirl.firebasestorage.app`

## Option A — Google Cloud Shell (no install)

1. Open https://console.cloud.google.com/ → project **scottlandyardirl** → click the Cloud Shell icon (top-right `>_`).
2. Upload `storage.cors.json` (Cloud Shell ⋮ menu → Upload), or paste its contents into a file.
3. Run:
   ```
   gsutil cors set storage.cors.json gs://scottlandyardirl.firebasestorage.app
   ```

## Option B — local gcloud CLI

1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. ```
   gcloud auth login
   gcloud config set project scottlandyardirl
   gcloud storage buckets update gs://scottlandyardirl.firebasestorage.app --cors-file=storage.cors.json
   ```

## Verify

```
gsutil cors get gs://scottlandyardirl.firebasestorage.app
```
Should print the policy. CORS changes take effect within ~1–2 min. Then the download button
produces a zip of real, watermarked photos.
