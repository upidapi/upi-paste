import { URL } from '~/lib/const';

export { PUT } from './[id]/route';

const USAGE_NOTE = `# Upload
curl -T file.txt ${URL}             # upload
curl -T file.txt ${URL}/rename.txt  # upload override name
echo "test" | curl -T - ${URL}      # pipe stdin
echo "test" | nc test.com 9999                # raw TCP
# => ${URL}/<id>?t=<token>

# Query params: 
# one-time
# psw=<pass>
# expiry=<abs ms|rel time{s,m,h,d,w,M,y}>,
# type=<mime type>
curl -T file.txt "${URL}?one-time&psw=1234&expiry=1789338467"
curl -T file.txt "${URL}/rename.txt/?expiry=1d&type=text%2Fcsv"

curl "${URL}/<id>"
curl -X DELETE "${URL}/<id>?t=<token>"`;

export async function GET() {
    return new Response(USAGE_NOTE, { status: 200 });
}
