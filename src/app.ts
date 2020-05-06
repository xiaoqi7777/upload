// {Request,Response,NextFunction} 文件声明
import express,{Request,Response,NextFunction} from 'express';
import logger from 'morgan';
import {INTERNAL_SERVER_ERROR} from 'http-status-codes';//500
import createError from 'http-errors';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import {mergeChunks, PUBLIC_DIR} from './utils'
// import multiparty from 'multiparty';//文件上传
import { TEMP_DIR } from './utils'
// const PUBLIC_DIR = path.resolve(__dirname,'public')
let app = express();
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(cors());
app.use(express.static(path.resolve(__dirname,'public')));

// filename chunk_name 是文件名
app.post('/upload/:filename/:chunk_name',async function(req:Request, res:Response, _next:NextFunction){
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
app.get('/merge/:filename',async function(req:Request, res:Response, _next:NextFunction){
  let { filename } = req.params
  await mergeChunks(filename)
  res.json({success:true})
})
// 每次先计算hash值
app.get('/verify/:filename',async function(req:Request, res:Response, _next:NextFunction):Promise<any>{
  let { filename } = req.params;
  let filePath = path.resolve(PUBLIC_DIR,filename)
  let exitFile = await fs.pathExists(filePath)
  if (exitFile){
    // 已经完整上传过了
    return {
      success:true,
      needUpload:false,// 因为已经上传过了,所以不在上传了,可以实现秒传
    }
  }
  let tempDir = path.resolve(TEMP_DIR,filename);
  let exist = await fs.pathExists(tempDir)
  let uploadList:any[] = []
  if (exist) {
    uploadList = await fs.readdir(tempDir)
    uploadList = await Promise.all(uploadList.map(async (filename:string)=>{
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
// app.post('/upload',async function(req:Request, res:Response, next:NextFunction){
//   let form = new multiparty.Form();
//   form.parse(req, async(err:any,fields,files) => {
//     if(err){
//       return next(err);
//     }
//     let filename = fields.filename[0];//23213.jpg
//     let chunk = files.chunk[0];// 文件流
//     await fs.move(chunk.path,path.resolve(PUBLIC_DIR,filename));
//     console.log('fields',fields)
//     console.log('files',files)
//     res.json({success:true})
//   })
// })
/*
fields { filename: [ '23213.jpg' ] }
files { chunk:
   [ { fieldName: 'chunk',
       originalFilename: '23213.jpg',
       path:
        'C:\\Users\\songge\\AppData\\Local\\Temp\\j_o0rbpdCBH3aWy6-THQu3ii.jpg',
       headers: [Object],
       size: 28484 } 
      ] 
    }
*/

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
export default app;

/*
  1、传递cookie 
    1、origin不能用* 
    2、xhr.withCredential:include
    3、all:true(服务器)

*/