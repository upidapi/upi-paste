// export { PUT } from './[id]/route';

const USAGE_NOTE = `
curl --upload-file ./filename.txt https://test.com
curl --upload-file ./filename.txt https://test.com/rename.txt

echo "test" | curl -T - https://test.com
echo "test" | curl -T - https://test.com/filename.txt

echo "test" | nc -p 9999 test.com
# => https://test.com/<id>?t=<token>

curl "https://test.com/<id>"
# => content

curl -X DELETE "https://test.com/<id>?t=<token>"
`;

export async function GET() {
    return new Response(USAGE_NOTE, { status: 200 });
}
