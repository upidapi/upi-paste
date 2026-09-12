
# usage

```bash
# PUT => https://test.com/filename.txt
curl --upload-file ./filename.txt https://test.com
# PUT => https://test.com/filename.txt
curl --upload-file ./filename.txt https://test.com/rename.txt

# PUT => https://test.com
echo "test" | curl -T - https://test.com
# PUT => https://test.com/filename.txt
echo "test" | curl -T - https://test.com/filename.txt

# special handled
echo "test" | nc -p 9999 test.com

# => https://test.com/<id>?t=<token>

curl "https://test.com/<id>"
# => content

curl -X DELETE "https://test.com/<id>?t=<token>"
```

# docs
params:
- p: password
- h: preview token
- t: owner token


