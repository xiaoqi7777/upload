import path from 'path';
import fs,{WriteStream} from 'fs-extra';
const DEFAULT_SIZE = 1024 * 10;
export const PUBLIC_DIR = path.resolve(__dirname,'public')

export const TEMP_DIR = path.resolve(__dirname,'temp')
// 切片
export const splitChunks = async (filename:string,size:number=DEFAULT_SIZE)=>{
  debugger
  let filePath = path.resolve(__dirname,filename);// 要分隔的文件绝对路径
  const chunksDir = path.resolve(TEMP_DIR,filename);// 以文件名命名的临时目录,存放分隔后的文件
  await fs.mkdirp(chunksDir);//递归创建文件夹 原生的fs没有 如果没父目录 会先创建父目录
  let content = await fs.readFile(filePath);// Buffer 其实就是一个字节数组  1个字节是8bit位
  let i = 0 , current = 0,length = content.length;
  while (current < length){
    console.log('i',i)
    await fs.writeFile(
      path.resolve(chunksDir, filename + '_' + i),
      content.slice(current, current + size)
    )
    i++;
    current += size;
  }
}
// splitChunks('23213.jpg')
const pipeStream = function(filePath:string, ws:WriteStream){
  return new Promise((resolve:Function,_reject:Function)=>{
    // 可读流
    console.log('filePath',filePath)
    let rs = fs.createReadStream(filePath)
    // 如果读完了 就删除文件(单个文件)
    rs.on('end',async () => {
      await fs.unlink(filePath);
      resolve()
    })
    rs.pipe(ws)
  })
}
/*
  1、读取 temp 目录下23213.jpg目录里所有的文件,还要按照尾部的索引号排序
  2、把他们累加在一起 令外一旦加过了要把temp目录里面的文件删除
  3、为了提高性能 进来用流来实现 不要readFile writeFile
*/
export const mergeChunks = async (filename:string, size:number = DEFAULT_SIZE) => {
  const filePath = path.resolve(PUBLIC_DIR, filename);
  const chunksDir = path.resolve(TEMP_DIR, filename);
  const chunkFiles = await fs.readdir(chunksDir);
  // 按照文件名 升序排序
  chunkFiles.sort((a:any,b:any)=>Number(a.split('-')[1]) - Number(b.split('-')[1]));
  // 合并 
  await Promise.all(chunkFiles.map((chunkFile: string, index: number) => pipeStream(
    // 相对改绝对
    path.resolve(chunksDir,chunkFile),
    fs.createWriteStream(filePath,{
      // 0-10开始  10-20 ...... start开始位子
      start: index * size
    })
  )))
  // 删除目录
  await fs.rmdir(chunksDir)
}
// mergeChunks('23213.jpg')
