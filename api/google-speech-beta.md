To use the Google Speech API:

1. Set up Google Cloud (may need to set up Billing)
2. Set up a project
3. Download credential.json
4. Download Google Cloud SDK
5. Upload compatible audio file (e.g. FLAC, WAV, etc.) to a Google Cloud bucket
6. Run the following command

curl -s -H "Content-Type: application/json" \
-H "Authorization: Bearer "$(GOOGLE_APPLICATION_CREDENTIALS=$HOME/Downloads/API\ Project-4c172d8b0f97.json gcloud auth application-default print-access-token) \ 
https://speech.googleapis.com/v1p1beta1/speech:recognize \
-d @sync-request.json

sync-request.json:
{
  "config": {
    "encoding": "FLAC",
    "languageCode": "en-US",
    "alternativeLanguageCodes": ["zh-CN", "zh-TW"],
    "model": "command_and_search"
  },
  "audio": {
    "uri": "gs://voicemail-speeches/voicemail-124.flac"
  }
}

Results:
{
  "results": [
    {
      "alternatives": [
        {
          "transcript": "将有3.5名服务生活美国大使馆提醒您您有一份文件相连取以及带相关证件过来办理流区人工查询请按九江有专人为您服务",
          "confidence": 0.95588064
        }
      ],
      "languageCode": "cmn-hans-cn"
    }
  ]
}
