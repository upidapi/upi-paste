# usage

```bash
# Upload
curl -T file.txt https://test.com             # upload
curl -T file.txt https://test.com/rename.txt  # upload override name
echo "test" | curl -T - https://test.com      # pipe stdin
# => https://test.com/<id>?t=<token>

# Query params: 
# one-time
# psw=<pass>
# expiry=<abs ms|rel time{s,m,h,d,w,M,y}>,
# type=<mime type>
curl -T file.txt "https://test.com?one-time&psw=1234&expiry=1789338467"
curl -T file.txt "https://test.com/rename.txt/?expiry=1d&type=text%2Fcsv"

curl "https://test.com/<id>"
curl -X DELETE "https://test.com/<id>?t=<token>"
```

# todo
remove all alerts / popups ("confirm")?

add netcat?
- echo "test" | nc test.com 9999                # raw TCP

Actually delete pastes (do a sweep every x minutes)
