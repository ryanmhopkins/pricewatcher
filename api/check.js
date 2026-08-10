import { runCheck } from '../lib/core.mjs';
export default async function handler(req,res){
  try{
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    if(!req.query.id)return res.status(400).json({error:'Missing id'});
    return res.status(200).json(await runCheck(req.query.id));
  }catch(e){return res.status(500).json({error:e.message})}
}
