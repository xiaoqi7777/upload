import path from 'path';
import fs, { WriteStream } from 'fs-extra';
const DEFAULT_SIZE = 1024 * 256;
export const PUBLIC_DIR = path.resolve(__dirname,'public')
export const TEMP_DIR = path.resolve(__dirname,'temp')

// 切片
// 读文件 循环写入文件 每次写入的大小自定义 用slice来切割流文件
export async function splitChunks(filename:string,size:number=DEFAULT_SIZE){
  // 读流
  const filePath = path.resolve(__dirname,filename)
  const content =await fs.readFile(filePath)
  // 写入的地址
  const chunksDir = path.resolve(TEMP_DIR,filename)
  // 创建文件
  await fs.mkdirp(chunksDir)
  let current=0;
  let length=content.length;
  let i = 0;
  while(current<length){
    await fs.writeFile(
      path.resolve(chunksDir,filename+'_'+i),
      content.slice(current,current+size)
    )
    i++;
    current+=size
  }
}
// splitChunks('2000574.jpg')

function pipeStream(filePath:string,ws:WriteStream){
  return new Promise(async(resolve:Function,_reject:Function)=>{
    let rs = fs.createReadStream(filePath)
    rs.on('end',async()=>{
      await fs.unlink(filePath)
      resolve()
    })
    rs.pipe(ws)
  })
}
// 合并
export const mergeChunks = async (filename:string, size:number = DEFAULT_SIZE) => {
  let filePath = path.resolve(PUBLIC_DIR,filename)
  let chunksDir = path.resolve(TEMP_DIR,filename)
  // fs.readdir 读目录
  const chunkFiles = await fs.readdir(chunksDir);
  chunkFiles.sort((a:any,b:any)=>Number(a.split('_')[1])-Number(b.split('_')[1]))
  // 合并
  await Promise.all(chunkFiles.map((chunkFile:string,index:number) => pipeStream(
    path.resolve(chunksDir,chunkFile),
    fs.createWriteStream(filePath,{
      start:index * size
    })
  )))
    // 删除目录
    await fs.rmdir(chunksDir)
}

// mergeChunks('2000574.jpg')

