import { createMonitor, listMonitors } from '../lib/core.mjs';
export default async function handler(req,res){
  try{
    if(req.method==='GET')return res.status(200).json(await listMonitors());
    if(req.method==='POST'){
      const{name,url}=req.body||{};
      if(!name||!url)return res.status(400).json({error:'Name and URL required'});
      new URL(url);
      const row=await createMonitor(String(name).trim(),String(url).trim());
      return res.status(row?.warning?201:201).json(row);
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(e){return res.status(500).json({error:e.message})}
}
