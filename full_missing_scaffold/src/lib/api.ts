export async function apiGet(url:string){
  const res = await fetch(url);
  return res.json();
}