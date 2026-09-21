import { getJSON, setJSON, json, store } from './_store.mjs';
import { requireUser, authError } from './_auth.mjs';

const pub = d => ({ accountId:d.accountId, username:d.username, name:d.name, email:d.email, phone:d.phone, workplaceName:d.workplaceName||'', degrees:Array.isArray(d.degrees)?d.degrees:[], workType:d.workType||'', dob:d.dob||'', schedule:d.schedule||'', leaflet:d.leaflet||'' });

async function getDoctorIds(q='') {
  const needle=String(q||'').trim().toLowerCase(); const out=[];
  const listed=await store().list({prefix:'user:'});
  for(const x of listed.blobs){const u=await getJSON(x.key,null);if(!u||u.accountType!=='DOCTOR')continue;const d=await getJSON(`doctor:${u.accountId}`,{});const hay=[u.username,u.name,u.email,d.workplaceName,d.workType,...(d.degrees||[])].join(' ').toLowerCase();if(!needle||hay.includes(needle)){out.push({...u,...d});if(out.length>=50)break;}}
  return out;
}
export default async req=>{
 const user=await requireUser(req);if(!user)return authError();
 try{
  if(req.method==='GET'){
   const url=new URL(req.url); const q=url.searchParams.get('q')||'';
   if(url.pathname.endsWith('/me')){if(user.accountType!=='DOCTOR')return json({error:'শুধু Doctor account-এর জন্য।'},403);const d=await getJSON(`doctor:${user.accountId}`,{});return json({success:true,doctor:{...pub({...user,...d}),name:user.name,phone:user.phone,email:user.email}})}
   const docs=await getDoctorIds(q); const mine=await getJSON(`friends:${user.accountId}`,{friends:[]});
   return json({success:true,doctors:docs.map(d=>({...pub(d),friend:(mine.friends||[]).includes(d.accountId)}))});
  }
  if(req.method==='POST'){
   if(user.accountType!=='DOCTOR')return json({error:'শুধু Doctor account-এর জন্য।'},403);
   const b=await req.json(); if(b.action!=='update')return json({error:'Invalid action'},400);
   const d=await getJSON(`doctor:${user.accountId}`,{});
   const next={...d,workplaceName:String(b.workplaceName??d.workplaceName??'').trim().slice(0,200),degrees:Array.isArray(b.degrees)?b.degrees.map(x=>String(x).trim()).filter(Boolean).slice(0,30):d.degrees||[],workType:String(b.workType??d.workType??'').trim().slice(0,150),schedule:String(b.schedule??d.schedule??'').trim().slice(0,5000)};
   if(b.leaflet!==undefined){const lf=String(b.leaflet||'');if(lf&&!lf.startsWith('data:image/'))return json({error:'শুধু image leaflet দেওয়া যাবে।'},400);if(lf.length>4_000_000)return json({error:'Leaflet image ছোট করুন।'},413);next.leaflet=lf;}
   await setJSON(`doctor:${user.accountId}`,next);return json({success:true,message:'Doctor profile updated.',doctor:{...pub({...user,...next}),name:user.name,phone:user.phone,email:user.email}});
  }
  return json({error:'Method Not Allowed'},405);
 }catch(e){console.error(e);return json({error:'Doctor data operation failed.'},500)}
     }
