## coding-generic
用于推送 generic 类型制品到 coding 制品库, 支持断点续传

## 安装

```shell
npm install coding-generic -g
```

## 使用

- 推送单个制品
```shell
coding-generic --username=<USERNAME>[:password] --path=<FILE.EXT> --registry=<REGISTRY>
```
- 推送文件夹（仅 1.2.7 及以上版本支持）
```shell
coding-generic -u=coding@coding.com --dir --path=<LOCAL_FOLDER_NAME> --registry=<REGISTRY>
```