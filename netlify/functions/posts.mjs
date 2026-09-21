import { getJSON, setJSON, json, store } from './_store.mjs';
import { requireUser, authError } from './_auth.mjs';
export default async req=>{
 const user=await requireUser(req); if(!user)return authError();
 try{
  if(req.method==='GET'){
   const listed=await store().list({prefix:'doctor-post:'}); const posts=[];
   for(const x of listed.blobs){const p=await getJSON(x.key,null);if(p)posts.push(p);}
   posts.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   return json({success:true,posts:posts.slice(0,100)});
  }
  if(req.method==='POST'){
   if(user.accountType!=='DOCTOR')return json({error:'শুধু Doctor post করতে পারবেন।'},403);
   const b=await req.json(); if(b.action!=='create')return json({error:'Invalid action'},400);
   const text=String(b.text||'').trim().slice(0,5000); const image=String(b.image||'');
   if(!text&&!image)return json({error:'Post text বা image দিন।'},400);
   if(image && (!image.startsWith('data:image/') || image.length>4_000_000))return json({error:'Image invalid বা খুব বড়।'},413);
   const post={id:`POST-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,doctorAccountId:user.accountId,doctorName:user.name||user.username,text,image,createdAt:new Date().toISOString()};
   await setJSON(`doctor-post:${post.id}`,post); return json({success:true,message:'Doctor post published.',post});
  }
  return json({error:'Method Not Allowed'},405);
 }catch(e){console.error(e);return json({error:'Post operation failed.'},500)}
};
