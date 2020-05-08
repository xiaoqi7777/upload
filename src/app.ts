import express,{Request,Response,NextFunction} from 'express';
import multiparty from 'multiparty';
import cors from 'cors';
import {INTERNAL_SERVER_ERROR} from 'http-status-codes';//500
import createError from 'http-errors';
import {mergeChunks, PUBLIC_DIR,TEMP_DIR} from './utils'
// 把原生的fs包装加强
import fs from 'fs-extra';
import path from 'path';

let app = express()
app.use(cors())
app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(express.static(path.resolve(__dirname,'public')));

// 测试接口
app.get('/test/:name',(req:Request,res:Response,next:NextFunction)=>{
  let {name} = req.params;
  console.log('==>',name)
  res.json({success:true})
  next()
})
// 图片上传 利用multiparty
app.post('/upload',(req:Request,res:Response,next:NextFunction)=>{
  let form = new multiparty.Form();
  form.parse(req,async(err:any,fields,files)=>{
    if(err){
      return next(err)
    }
    let filename = fields.chunk_name[0];//xxx.jpg
    let chunk = files.chunk[0];// 文件流
    await fs.move(chunk.path,path.resolve(PUBLIC_DIR,filename));
    res.json({success:true})
  })
})
app.post('/upload/:filename/:chunk_name/:start',async function(req:Request, res:Response, _next:NextFunction){
  let { filename, chunk_name } = req.params; 
  let start:number = Number(req.params.start)
  let chunk_dir = path.resolve(TEMP_DIR,filename)  
  let exist = await fs.pathExists(chunk_dir)
  if(!exist){
    await fs.mkdirs(chunk_dir)
  } 
  let chunkFilePath = path.resolve(chunk_dir,chunk_name)
  // start 0 开始写入的位子 
  // flags 'a' 追加的意思
  let ws = fs.createWriteStream(chunkFilePath, {start,flags:'a'})
  req.on('end',()=>{
    ws.close()
    res.json({success:true})
  })
  req.on('error',()=>{
    ws.close()
  })
  req.on('close',()=>{
    ws.close()
  })
  req.pipe(ws);
})
// 每次先计算hash值
app.get('/verify/:filename',async function(req:Request, res:Response, _next:NextFunction):Promise<any>{
  let { filename } = req.params;
  let filePath = path.resolve(PUBLIC_DIR,filename);
  let exitFile = await fs.pathExists(filePath);
  console.log('文件是否合并',exitFile);
  // 只有传完 才会进去这 因为只有最后一个hash进行合并的时候 `PUBLIC_DIR`才会有数据
  if (exitFile){
    // 已经完整上传过了
    res.json ({
      success:true,
      needUpload:false,// 因为已经上传过了,所以不在上传了,可以实现秒传
    })
    return
  }
  // 片段
  let tempDir = path.resolve(TEMP_DIR,filename);
  let exist = await fs.pathExists(tempDir)
  let uploadList:any[] = []
  // 如果已经传入了片段 
  if (exist) {
    uploadList = await fs.readdir(tempDir)
    uploadList = await Promise.all(uploadList.map(async (filename:string)=>{
      // 读取 已经上传的文件信息 返回
      let stat = await fs.stat(path.resolve(tempDir, filename));
      return {
        filename,
        size:stat.size //现在的文件大小 
      }
    }))
  }
  res.json({
    success:true,
    needUpload:true,
    uploadList// 已经上传的文件列表
  })
})
app.get('/merge/:filename',async function(req:Request, res:Response, _next:NextFunction){
  let { filename } = req.params
  await mergeChunks(filename)
  res.json({success:true})
})
// 没有路由匹配 会进入这
app.use(function (_req:Request, _res:Response,next:NextFunction){
  next(createError(404))
})
// 错误中间件
app.use(function( error:any, _req:Request, res:Response, _next:NextFunction){
  res.status(error.status || INTERNAL_SERVER_ERROR)
  res.json({
    success:false,
    error
  });
});
export default app