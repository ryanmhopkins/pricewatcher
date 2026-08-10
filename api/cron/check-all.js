import { runAll } from '../../lib/core.mjs';
export default async function handler(req,res){
  try{return res.status(200).json(await runAll())}
  catch(e){return res.status(500).json({error:e.message})}
}
