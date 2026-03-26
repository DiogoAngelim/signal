import { runPostPublicationDemo } from "./packages/examples/post-publication";

async function main() {
  const output = await runPostPublicationDemo();
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
