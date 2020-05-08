import React, { ChangeEvent, useState,useEffect } from 'react';
import { Row, Col, Input, Button, message, Progress, Table } from 'antd'
import { request } from './utils'
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
function Upload() {
  let [uploadStatus,setUploadStatus] = useState<UploadStatus>(UploadStatus.INIT)
  let [currentFile, setCurrentFile] = useState<File>();
  let [objectURL,setObjectURL] = useState<string>();
  let [hashPercent,setHashPercent] = useState<number>(0);
  let [filename,setFilename] = useState<string>();
  // PartList 存放切片的数据
  let [partList,setPartList] = useState<Part[]>([]);
  useEffect(()=>{
    if(!currentFile) return
    const reader = new FileReader()
    reader.addEventListener('load',() => setObjectURL(reader.result as string))
    reader.readAsDataURL(currentFile);
  },[currentFile])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // event.target.files![0] 就是上传文件的信息
    setCurrentFile(event.target.files![0])
  }
  async function handleUpload() {
    if (!currentFile) {
      return message.error(`你尚未选择文件`)
    }
    if (!allowUpload(currentFile)) {
      return message.error(`不支持本类型文件上传`)
    }
    // 弹出进度条
    setUploadStatus(UploadStatus.UPLOADING)
    // 分片上传 createChunks根据切片的大小 将文件进行切割
    let partList:Part[] = createChunks(currentFile)
    // 将切割的文件 上传 hash计算 利用Worker创建一个子经常进行计算
    let fileHash = await calculateHash(partList)
    let lastDoIndex = currentFile.name.lastIndexOf('.')
    let extName = currentFile.name.slice(lastDoIndex)
    let filename = `${fileHash}${extName}`
    setFilename(filename)
    partList = partList.map(({chunk,size,loaded,percent},index)=>({
      filename, // hash.jpg
      chunk_name:`${filename}-${index}`,
      chunk,
      size,
      loaded:0,
      percent:0
    }))
    setPartList(partList);
    console.log('所有的切片集合',partList)
    await uploadParts(partList,filename)
  }
  function calculateHash(partList:Part[]){
    return new Promise((resolve:Function,reject:Function)=>{
      // /hash.js 他会找public/hash的位子
      let worker = new Worker('/hash.js')
      worker.postMessage({partList})
      worker.onmessage = function(event){
        let {percent,hash} = event.data
        setHashPercent(percent)
        // 有hash 就说明切割完成
        if(hash){
          resolve(hash)
        }
      }
    })
  }
  // verify 功能就是查看数据是否上传完成  已经返回已上传的数据大小 和 名字(当刷新页面的时候 会接着传递)
  async function verify(filename:string){
    return  request({
      url:`/verify/${filename}`,
      method:'get'
    })
  }
  async function uploadParts(partList:Part[],filename:string){
    // partList 是所有的切片
    // uploadList 已经上传过的所有信息
    let data = await verify(filename)
    console.log('uploadList',data)
    let  { needUpload,uploadList } = data

    console.log('needUpload',needUpload)
    if (!needUpload){
      reset()
      return message.success('秒传成功')
    }
    // uploadList 已经上传的数据包信息
    // partList 总的数据包
    let requests = createRequests(partList,uploadList,filename)
    await Promise.all(requests)
    await request({
      url:`/merge/${filename}`,
      method:'GET'
    })
    message.success('上传成功');
    reset();
  } 
  function reset() {
    setUploadStatus(UploadStatus.INIT);
    setHashPercent(0);
    setPartList([]);
    setFilename('');
  }
  function createRequests(partList:Part[],uploadList:Upload[],filename:string){
    return partList.filter((part:Part)=>{
        part.loaded = part.loaded?part.loaded:0;
        // uploadList 已经上传过的列表
        let uploadFile = uploadList.find(item=>item.filename === part.chunk_name);
        // 没有上传过 直接退出
        if(!uploadFile){
          part.loaded = 0;// 已经上传的字节数0
          part.percent = 0;// 已经上传的百分比就是0 分片上传过的半分比就是0
          return true
        }
        // 过滤已经上传过的
        if(uploadFile.size < part.chunk.size){
          part.loaded = uploadFile.size;// 已经上传的字节数0
          part.percent = Number((part.loaded/part.chunk.size * 100).toFixed(2));// 已经上传的百分比就是0 分片上传过的半分比就是0
          return true
        }
        return false
      }).map((part:Part)=>request({
        url:`/upload/${filename}/${part.chunk_name}/${part.loaded}`,
        method:'POST',
        // application/octet-stream 字节流
        headers:{'Content-Type':'application/octet-stream'},
        // 在发送请的时候 将xhr保存在partList中
        setXHR:(xhr:XMLHttpRequest) => part.xhr = xhr,
        onProgress: (event:ProgressEvent) => {
          part.percent = Number(((part.loaded! + event.loaded!)/part.chunk.size*100).toFixed(2))
          // 页面刷新
          setPartList([...partList])
        },
        data:part.chunk
      })
    )
  }
  // 暂停
  function handlePause(){
    // 如果请求已被发送，则立刻中止请求。
    partList.forEach((part:Part) => part.xhr && part.xhr.abort())
    setUploadStatus(UploadStatus.PAUSE)
  }
  // 恢复
  async function handleResume(){
    setUploadStatus(UploadStatus.UPLOADING)
    // 发送请求
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
  let uploadProgress = uploadStatus !== UploadStatus.INIT ? (
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
        {/* 按钮点击 */}
        <Col span={12}>
          <Input type='file' style={{ width: 300 }} onChange={handleChange}></Input>
          <Button type="primary" onClick={handleUpload} style={{ marginLeft: 10 }}>上传图片</Button>
          {
            uploadStatus === UploadStatus.UPLOADING && <Button type="primary" onClick={handlePause} style={{marginLeft:10}}>暂停</Button>
          }
          {
            uploadStatus === UploadStatus.PAUSE && <Button type="primary" onClick={handleResume} style={{marginLeft:10}}>恢复</Button>
          }
        </Col>
        {/* 图片预览 */}
        <Col span={12}>
          {objectURL && <img src={objectURL} style={{width:100}} alt='视频'/>}
        </Col>
      </Row>
      {uploadProgress}
    </>
  )
}
function allowUpload(currentFile: File) {
  let fileType = currentFile.type;// type: "image/jpeg"
  let validFileTypes = ["image/jpeg", "image/png", "image/gif", "video/mp3", "video/avi"]
  let isLessThan2G = currentFile.size < 1024 * 1024 * 1024 * 2
  return validFileTypes.includes(fileType) && isLessThan2G
}
function createChunks(file:File):Part[]{
  let current = 0
  let partList:Part[] = []
  while(current<file.size){
    let chunk = file.slice(current,current+DEFAULT_SIZE)
    partList.push({chunk,size:chunk.size})
    current += DEFAULT_SIZE
  }
  return partList
}


export default Upload
