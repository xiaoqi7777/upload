import React,{ChangeEvent, useState, useEffect} from 'react';
import {Row,Col,Input,Button, message,Table,Progress} from 'antd';
import { request } from './utils'
// 100M 
// const DEFAULT_SIZE = 1024 * 1024 * 100;
// 256k
const DEFAULT_SIZE = 1024 * 1024 * 20
enum UploadStatus{
  INIT,
  PAUSE,
  UPLOADING
}
interface Part{
  chunk:Blob;
  size:number;
  filename?:string;
  chunk_name?:string;
  loaded?:number;
  percent?:number;
  xhr?:any;
}
interface Upload{
  filename:string;
  size:number
}
function Upload(){
  let [uploadStatus,setUploadStatus] = useState<UploadStatus>(UploadStatus.INIT)
  let [currentFile,setCurrentFile] = useState<File>();
  let [objectURL,setObjectURL] = useState<string>();
  let [hashPercent,setHashPercent] = useState<number>(0);
  let [filename,setFilename] = useState<string>();
  // PartList 存放切片的数据
  let [partList,setPartList] = useState<Part[]>([]);
  useEffect(()=>{
    if(!currentFile) return
    // 1、window.URL.createObjectURL 可能导致内存泄露
    // 通过对象创建url地址 url是一个二进制地址
    let objectURL = window.URL.createObjectURL(currentFile);
    setObjectURL(objectURL)
    // 组件销毁的时候 才执行 释放使用的资源
    return () => window.URL.revokeObjectURL(objectURL)
    // 2、FileReader 建议用下面这个
    // const reader = new FileReader()
    // reader.addEventListener('load',() => setObjectURL(reader.result as string))
    // reader.readAsDataURL(currentFile);
  },[currentFile])
  function handleChange(event:ChangeEvent<HTMLInputElement>){
    let file:File = event.target.files![0]
    console.log(file)
    setCurrentFile(file)
  }
  function calculateHash(partList:Part[]):Promise<String>{
    return new Promise((resolve,reject)=>{
      // /hash.js 他会找public/hash的位子
      let worker = new Worker('/hash.js');
      worker.postMessage({partList});
      worker.onmessage = function(event){
        let { percent, hash} = event.data
        console.log('percent',percent)
        setHashPercent(percent)
        if(hash){
          resolve(hash);
        }
      }
    })
  }
  function reset() {
    setUploadStatus(UploadStatus.INIT);
    setHashPercent(0);
    setPartList([]);
    setFilename('');
  }
  async function handleUpload(){
    if(!currentFile){
      return message.error(`你尚未选择文件`)
    }
    if(!allowUpload(currentFile)){
      return message.error(`不支持本类型文件上传`)
    }
    setUploadStatus(UploadStatus.UPLOADING)
    // 分片上传
    let partList:Part[] = createChunks(currentFile);
    // 先计算这个对象的哈希值 秒传的功能 通过webworker子进程来计算哈希
    let fileHash = await calculateHash(partList)
    let lastDoIndex = currentFile.name.lastIndexOf('.')
    let extName = currentFile.name.slice(lastDoIndex)
    let filename = `${fileHash}${extName}`;// hash.jpg
    setFilename(filename)
    partList = partList.map(({chunk,size,loaded,percent},index)=>({
      filename, // hash.jpg
      chunk_name:`${filename}-${index}`,
      chunk,
      size:size,
      loaded:0,
      percent:0
    }))
    setPartList(partList);
    // 上传 
    console.log('===>')
    await uploadParts(partList,filename)
    // 图片上传  FormData
    // const formData = new FormData();
    // formData.append('chunk',currentFile);//添加文件 字段名 chunk
    // formData.append('filename',currentFile.name);// 图片的文件名字
    // let result = await request({
    //   url:'/upload',
    //   method:'POST',
    //   data:formData
    // });
    // console.log('result',result)
    // message.info('上传成功');
  }
  async function verify(filename:string){
    return await request({
      url:`/verify/${filename}`,
      method:'get'
    })
  }
  // 上传文件
  async function uploadParts(partList:Part[],filename:string){
    let { needUpload, uploadList } = await verify(filename)
    if (!needUpload){
      return message.success('秒传成功')
    }
    let requests = createRequests(partList,uploadList,filename)
    await Promise.all(requests)
    await request({
      url:`/merge/${filename}`,
      method:'GET'
    })
    message.success('上传成功');
    reset();
  }
  function createRequests(partList:Part[],uploadList:Upload[],filename:string){
    return partList.filter((part:Part)=> {
      // uploadList 已经上传过的列表
      let uploadFile = uploadList.find(item=>item.filename === part.chunk_name);
      console.log('uploadFile=>',uploadFile)
      if(!uploadFile){
        part.loaded = 0;// 已经上传的字节数0
        part.percent = 0;// 已经上传的百分比就是0 分片上传过的半分比就是0
        return true
      }
      console.log('uploadFile.size',uploadFile.size,part.chunk.size)
      if (uploadFile.size < part.chunk.size){
        part.loaded = uploadFile.size; // 已经上传的字节数
        console.log('part.loaded',part.loaded)
        part.percent =Number((part.loaded/part.chunk.size * 100).toFixed(2)); // 已经上传的百分比
        return true;
      }
      // 上传完成
      return false
    }).map((part:Part)=>request({
      url:`/upload/${filename}/${part.chunk_name}/${part.loaded}`,// 请求的URL地址
      method:'POST',
      // application/octet-stream 字节流
      headers:{'Content-Type':'application/octet-stream'},
      // 发送的时候 将xhr实例 放到part内
      setXHR:(xhr:XMLHttpRequest) => part.xhr = xhr,
      onProgress: (event:ProgressEvent) => {
        console.log('onProgress=>')
        part.percent = Number(((part.loaded! + event.loaded!)/part.chunk.size*100).toFixed(2))
        // 页面刷新
        setPartList([...partList])
      },
      // 请求体的格式
      data:part.chunk
    }))
  }
  async function handlePause(){
    partList.forEach((part:Part) => part.xhr && part.xhr.abort())
    setUploadStatus(UploadStatus.PAUSE)
  }
  async function handleResume(){
    setUploadStatus(UploadStatus.UPLOADING)
    await uploadParts(partList,filename!) 
  }
  // 总进度
  let totalPercent = partList.length>0 ? partList.reduce(
    (a:number,b:Part)=>a+b.percent!,0)/partList.length  :0
  const columns = [
    {
      title:'切片名称',
      dataIndex:"filename",
      key:"filename",
      width:"20%"
    },
    {
      title:'进度',
      dataIndex:"percent",
      key:"percent",
      width:"80%",
      render:(value:number)=>{
        return <Progress percent={value} />
      }
    }
  ]
  let uploadProgress =uploadStatus !== UploadStatus.INIT ?(
    <>
     <Row>
        <Col span={4}>
          HASH总进度
        </Col>
        <Col span={20}>
          <Progress percent={hashPercent}/>
        </Col>
      </Row>
      <Row>
        <Col span={4}>
          总进度
        </Col>
        <Col span={20}>
          <Progress percent={totalPercent}/>
        </Col>
      </Row>
      <Table 
        columns= {columns}
        dataSource = {partList}
        rowKey={row => row.chunk_name!}
      />

    </>
  ):null;
  return (
    <>
      <Row>
        <Col span={12}>
          <Input type="file" style={{width:300}} onChange={handleChange}/>
          <Button type="primary" onClick={handleUpload} style={{marginLeft:10}}>上传图片</Button>
          {
            uploadStatus === UploadStatus.UPLOADING && <Button type="primary" onClick={handlePause} style={{marginLeft:10}}>暂停</Button>
          }
          {
            uploadStatus === UploadStatus.PAUSE && <Button type="primary" onClick={handleResume} style={{marginLeft:10}}>恢复</Button>
          }
          
        </Col>
        <Col span={12}>
            {objectURL&&<img src={objectURL} style={{width:100}}/>}
        </Col>
      </Row>
      {uploadProgress}
    </>
  )
}

function createChunks(file:File):Part[]{
  let current = 0;
  let partList:Part[] = []
  while(current < file.size){
    let chunk = file.slice(current,current + DEFAULT_SIZE);
    console.log('==>')
    partList.push({ chunk, size: chunk.size})
    current += DEFAULT_SIZE
  }
  return partList
}
// File是ts类型  他继承Blob
function allowUpload(file:File){
  let type = file.type;// type: "image/jpeg"
  let validFileTypes = ["image/jpeg","image/png","image/gif","video/mp3","video/avi"]
  if(!validFileTypes.includes(type)){
    message.error(`不支持此类文件上传`)
  }
  // 文件大小的单位是字节 1024bytes = 1K*1024 = 1M*1024 = 1G*2 = 2G 
  const isLessThan2G = file.size < 1024*1024*1024*2
  if(!isLessThan2G){
    message.error(`上传的图片不能大于2G`)
  }
  return validFileTypes&&isLessThan2G
}

export default Upload