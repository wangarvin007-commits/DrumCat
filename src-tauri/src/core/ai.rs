use futures_util::StreamExt;
use reqwest::{
    Client, Url,
    header::{HeaderMap, HeaderName, HeaderValue},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, net::IpAddr, time::Duration};
use tauri::{command, ipc::Channel};

const MAX_ERROR_LENGTH: usize = 480;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProtocol {
    Anthropic,
    Openai,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHttpRequest {
    url: String,
    headers: HashMap<String, String>,
    body: Value,
    stream: bool,
    timeout_ms: Option<u64>,
    protocol: AiProtocol,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum AiStreamEvent {
    Delta(String),
}

#[command]
pub async fn stream_ai_reply(
    request: AiHttpRequest,
    on_event: Channel<AiStreamEvent>,
) -> Result<String, String> {
    let mut on_delta = |delta| {
        let _ = on_event.send(AiStreamEvent::Delta(delta));
    };

    perform_ai_request(request, &mut on_delta).await
}

async fn perform_ai_request<F>(request: AiHttpRequest, on_delta: &mut F) -> Result<String, String>
where
    F: FnMut(String),
{
    let parsed_url = validate_url(&request.url)?;
    let headers = build_headers(request.headers)?;
    let timeout = request.timeout_ms.unwrap_or(90_000).clamp(5_000, 120_000);
    let mut client_builder = Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_millis(timeout));

    if is_loopback_endpoint(&parsed_url) {
        client_builder = client_builder.no_proxy();
    }

    let client = client_builder
        .build()
        .map_err(|error| format!("无法初始化 AI 网络客户端：{error}"))?;

    let response = client
        .post(&request.url)
        .headers(headers)
        .json(&request.body)
        .send()
        .await
        .map_err(|error| format!("无法连接 AI 接口：{error}"))?;
    let status = response.status();

    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "接口返回 {}{}",
            status.as_u16(),
            format_error_detail(&detail)
        ));
    }

    let is_event_stream = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.to_ascii_lowercase().contains("text/event-stream"));

    if !request.stream || !is_event_stream {
        let value = response
            .json::<Value>()
            .await
            .map_err(|error| format!("AI 接口返回了无法解析的数据：{error}"))?;
        let content = extract_response_text(request.protocol, &value)?;

        if !content.is_empty() {
            on_delta(content.clone());
        }

        return Ok(content);
    }

    let mut bytes = response.bytes_stream();
    let mut pending = Vec::new();
    let mut result = String::new();

    while let Some(chunk) = bytes.next().await {
        let chunk = chunk.map_err(|error| format!("AI 流式响应中断：{error}"))?;
        pending.extend_from_slice(&chunk);
        consume_complete_lines(&mut pending, request.protocol, on_delta, &mut result)?;
    }

    if !pending.is_empty() {
        consume_stream_line(&pending, request.protocol, on_delta, &mut result)?;
    }

    Ok(result.trim().to_owned())
}

fn validate_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|_| "AI 接口地址不是有效 URL".to_owned())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("AI 接口只支持 http 或 https 地址".to_owned());
    }

    Ok(parsed)
}

fn is_loopback_endpoint(url: &Url) -> bool {
    url.host_str().is_some_and(|host| {
        host.eq_ignore_ascii_case("localhost")
            || host
                .parse::<IpAddr>()
                .is_ok_and(|address| address.is_loopback())
    })
}

fn build_headers(headers: HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut result = HeaderMap::new();

    for (name, value) in headers {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("无效的请求头名称：{name}"))?;
        let value = HeaderValue::from_str(&value)
            .map_err(|_| format!("请求头 {} 包含无效字符", name.as_str()))?;
        result.insert(name, value);
    }

    Ok(result)
}

fn consume_complete_lines<F>(
    pending: &mut Vec<u8>,
    protocol: AiProtocol,
    on_delta: &mut F,
    result: &mut String,
) -> Result<(), String>
where
    F: FnMut(String),
{
    while let Some(index) = pending.iter().position(|byte| *byte == b'\n') {
        let line = pending.drain(..=index).collect::<Vec<_>>();
        consume_stream_line(&line, protocol, on_delta, result)?;
    }

    Ok(())
}

fn consume_stream_line<F>(
    line: &[u8],
    protocol: AiProtocol,
    on_delta: &mut F,
    result: &mut String,
) -> Result<(), String>
where
    F: FnMut(String),
{
    let line = String::from_utf8_lossy(line);
    let payload = line.trim();

    if !payload.starts_with("data:") {
        return Ok(());
    }

    let json = payload.trim_start_matches("data:").trim();
    if json.is_empty() || json == "[DONE]" {
        return Ok(());
    }

    let value = serde_json::from_str::<Value>(json)
        .map_err(|error| format!("AI 流式数据无法解析：{error}"))?;

    if let Some(message) = extract_error_message(&value) {
        return Err(format!("AI 接口返回错误：{message}"));
    }

    if let Some(delta) = extract_stream_delta(protocol, &value) {
        result.push_str(&delta);
        on_delta(delta);
    }

    Ok(())
}

fn extract_stream_delta(protocol: AiProtocol, value: &Value) -> Option<String> {
    match protocol {
        AiProtocol::Openai => value
            .pointer("/choices/0/delta/content")
            .and_then(extract_text_value)
            .or_else(|| {
                value
                    .pointer("/choices/0/message/content")
                    .and_then(extract_text_value)
            }),
        AiProtocol::Anthropic => {
            if value.get("type").and_then(Value::as_str) != Some("content_block_delta") {
                return None;
            }

            value
                .pointer("/delta/text")
                .and_then(Value::as_str)
                .map(str::to_owned)
        }
    }
}

fn extract_response_text(protocol: AiProtocol, value: &Value) -> Result<String, String> {
    if let Some(message) = extract_error_message(value) {
        return Err(format!("AI 接口返回错误：{message}"));
    }

    let content = match protocol {
        AiProtocol::Openai => value
            .pointer("/choices/0/message/content")
            .and_then(extract_text_value)
            .or_else(|| value.get("output_text").and_then(extract_text_value)),
        AiProtocol::Anthropic => value.get("content").and_then(extract_text_value),
    }
    .unwrap_or_default()
    .trim()
    .to_owned();

    Ok(content)
}

fn extract_text_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_owned());
    }

    let values = value.as_array()?;
    let text = values
        .iter()
        .filter_map(|item| {
            item.get("text")
                .and_then(Value::as_str)
                .or_else(|| item.get("content").and_then(Value::as_str))
        })
        .collect::<String>();

    (!text.is_empty()).then_some(text)
}

fn extract_error_message(value: &Value) -> Option<String> {
    value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| {
            (value.get("type").and_then(Value::as_str) == Some("error"))
                .then(|| value.pointer("/error/type").and_then(Value::as_str))
                .flatten()
        })
        .map(str::to_owned)
}

fn format_error_detail(detail: &str) -> String {
    let detail = detail.trim();
    if detail.is_empty() {
        return String::new();
    }

    let shortened = detail.chars().take(MAX_ERROR_LENGTH).collect::<String>();
    let suffix = if detail.chars().count() > MAX_ERROR_LENGTH {
        "…"
    } else {
        ""
    };
    format!("：{shortened}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::{
        AiHttpRequest, AiProtocol, extract_response_text, extract_stream_delta, perform_ai_request,
        validate_url,
    };
    use serde_json::json;
    use std::{
        collections::HashMap,
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
    };

    #[test]
    fn extracts_openai_text_from_string_and_blocks() {
        let string_response = json!({
            "choices": [{ "message": { "content": "连接成功" } }]
        });
        let block_response = json!({
            "choices": [{
                "message": {
                    "content": [
                        { "type": "text", "text": "你" },
                        { "type": "text", "text": "好" }
                    ]
                }
            }]
        });

        assert_eq!(
            extract_response_text(AiProtocol::Openai, &string_response).unwrap(),
            "连接成功"
        );
        assert_eq!(
            extract_response_text(AiProtocol::Openai, &block_response).unwrap(),
            "你好"
        );
    }

    #[test]
    fn extracts_openai_and_anthropic_stream_deltas() {
        let openai = json!({
            "choices": [{ "delta": { "content": "尾包" } }]
        });
        let anthropic = json!({
            "type": "content_block_delta",
            "delta": { "type": "text_delta", "text": "完整" }
        });

        assert_eq!(
            extract_stream_delta(AiProtocol::Openai, &openai).as_deref(),
            Some("尾包")
        );
        assert_eq!(
            extract_stream_delta(AiProtocol::Anthropic, &anthropic).as_deref(),
            Some("完整")
        );
    }

    #[test]
    fn only_allows_http_endpoints() {
        assert!(validate_url("https://api.example.com/v1/chat/completions").is_ok());
        assert!(validate_url("http://127.0.0.1:11434/v1/chat/completions").is_ok());
        assert!(validate_url("file:///tmp/secret").is_err());
    }

    #[test]
    fn native_transport_sends_headers_and_streams_sse() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let received = Arc::new(Mutex::new(String::new()));
        let server_received = Arc::clone(&received);

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0_u8; 4_096];
            let length = stream.read(&mut buffer).unwrap();
            *server_received.lock().unwrap() =
                String::from_utf8_lossy(&buffer[..length]).into_owned();

            let body = concat!(
                "data: {\"choices\":[{\"delta\":{\"content\":\"原生\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"content\":\"接口\"}}]}\n\n",
                "data: [DONE]\n\n"
            );
            let response = format!(
                concat!(
                    "HTTP/1.1 200 OK\r\n",
                    "Content-Type: text/event-stream\r\n",
                    "Content-Length: {}\r\n",
                    "Connection: close\r\n\r\n",
                    "{}"
                ),
                body.len(),
                body,
            );

            stream.write_all(response.as_bytes()).unwrap();
        });

        let request = AiHttpRequest {
            url: format!("http://{address}/v1/chat/completions"),
            headers: HashMap::from([
                ("authorization".to_owned(), "Bearer local-test".to_owned()),
                ("content-type".to_owned(), "application/json".to_owned()),
            ]),
            body: json!({
                "model": "local-test",
                "messages": [{ "role": "user", "content": "你好" }],
                "stream": true
            }),
            stream: true,
            timeout_ms: Some(5_000),
            protocol: AiProtocol::Openai,
        };
        let deltas = Arc::new(Mutex::new(Vec::new()));
        let streamed_deltas = Arc::clone(&deltas);
        let mut on_delta = move |delta| streamed_deltas.lock().unwrap().push(delta);

        let reply = tauri::async_runtime::block_on(perform_ai_request(request, &mut on_delta))
            .expect("native AI request should succeed");

        server.join().unwrap();
        assert_eq!(reply, "原生接口");
        assert_eq!(*deltas.lock().unwrap(), ["原生", "接口"]);

        let request_text = received.lock().unwrap();
        assert!(request_text.starts_with("POST /v1/chat/completions HTTP/1.1"));
        assert!(
            request_text
                .to_ascii_lowercase()
                .contains("authorization: bearer local-test")
        );
    }
}
