import sys

# Patch 1: /opt/conda/lib/python3.12/site-packages/vllm/parser/deepseek_v4.py
target_parser = "/opt/conda/lib/python3.12/site-packages/vllm/parser/deepseek_v4.py"
with open(target_parser, "r", encoding="utf-8") as f:
    content = f.read()

patch_code = '''
    def _extract_tool_and_param(self) -> tuple[str, str]:
        target_tool = "bash"
        target_param = "command"
        if not self._tools:
            return target_tool, target_param
        for t in self._tools:
            if isinstance(t, dict):
                fn = t.get("function", {})
                name = fn.get("name", "")
                params = fn.get("parameters", {}) or {}
            else:
                fn = getattr(t, "function", None)
                name = getattr(fn, "name", "") if fn else getattr(t, "name", "")
                params = getattr(fn, "parameters", {}) if fn else getattr(t, "parameters", {})
            props = params.get("properties", {}) if isinstance(params, dict) else getattr(params, "properties", {})
            if not isinstance(props, dict):
                props = {}
            if name.lower() in ("bash", "execute", "run_command", "execute_command", "terminal", "cmd"):
                target_tool = name
                if "command" in props:
                    target_param = "command"
                elif "cmd" in props:
                    target_param = "cmd"
                elif props:
                    target_param = list(props.keys())[0]
                return target_tool, target_param
            elif "command" in props or "cmd" in props:
                target_tool = name
                target_param = "command" if "command" in props else "cmd"
                return target_tool, target_param

        first_t = self._tools[0]
        if isinstance(first_t, dict):
            target_tool = first_t.get("function", {}).get("name", "bash")
            props = first_t.get("function", {}).get("parameters", {}).get("properties", {})
        else:
            fn = getattr(first_t, "function", None)
            target_tool = getattr(fn, "name", "bash") if fn else getattr(first_t, "name", "bash")
            props = getattr(getattr(fn, "parameters", None), "properties", {}) if fn else {}
        if isinstance(props, dict) and props:
            target_param = list(props.keys())[0]
        return target_tool, target_param

    def parse(
        self,
        model_output: str,
        request,
        enable_auto_tools: bool = False,
        model_output_token_ids=(),
    ):
        reasoning, content, tool_calls = super().parse(
            model_output,
            request,
            enable_auto_tools=enable_auto_tools,
            model_output_token_ids=model_output_token_ids,
        )
        if content and ("DSML" in content or "DSML" in model_output):
            exec_matches = re.findall(
                r"<[｜|]DSML[｜|]_execute>\s*(.*?)\s*</[｜|]DSML[｜|]_execute>",
                content,
                flags=re.DOTALL,
            )
            if not exec_matches:
                exec_matches = re.findall(
                    r"<[｜|]DSML[｜|]_execute>\s*(.*?)\s*</[｜|]DSML[｜|]_execute>",
                    model_output,
                    flags=re.DOTALL,
                )
            if exec_matches:
                if tool_calls is None:
                    tool_calls = []
                from vllm.entrypoints.chat_utils import make_tool_call_id
                from vllm.entrypoints.openai.engine.protocol import FunctionCall
                target_tool, target_param = self._extract_tool_and_param()
                for cmd in exec_matches:
                    cmd_clean = cmd.strip()
                    if cmd_clean:
                        tool_calls.append(
                            FunctionCall(
                                id=make_tool_call_id(),
                                name=target_tool,
                                arguments=json.dumps({target_param: cmd_clean}, ensure_ascii=False),
                            )
                        )
            cleaned = re.sub(r"<[｜|]DSML[｜|]_execute>.*?</[｜|]DSML[｜|]_execute>", "", content, flags=re.DOTALL)
            cleaned = re.sub(r"</?[｜|]DSML[｜|][^>]*>", "", cleaned).strip()
            if not cleaned and tool_calls:
                content = None
            else:
                content = cleaned or None

        return reasoning, content, tool_calls
'''

if "def _extract_tool_and_param" not in content:
    content += "\n" + patch_code
    with open(target_parser, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched deepseek_v4.py successfully")
else:
    print("deepseek_v4.py already patched")

# Patch 2: /opt/conda/lib/python3.12/site-packages/vllm/entrypoints/openai/chat_completion/serving.py
target_serving = "/opt/conda/lib/python3.12/site-packages/vllm/entrypoints/openai/chat_completion/serving.py"
with open(target_serving, "r", encoding="utf-8") as f:
    serving_content = f.read()

target_marker = "if tools_streamed[i] and not tool_choice_function_name:"
patch_stream = """                        # Fallback for DSML execute in streaming
                        if not tools_streamed[i] and previous_texts[i] and ("DSML" in previous_texts[i] or "_execute" in previous_texts[i]):
                            exec_matches = re.findall(
                                r"<[｜|]DSML[｜|]_execute>\s*(.*?)\s*</[｜|]DSML[｜|]_execute>",
                                previous_texts[i],
                                flags=re.DOTALL,
                            )
                            if exec_matches:
                                tools_streamed[i] = True
                                target_tool = "bash"
                                target_param = "command"
                                if request.tools:
                                    for t in request.tools:
                                        fn = t.get("function", {}) if isinstance(t, dict) else getattr(t, "function", None)
                                        name = fn.get("name", "") if isinstance(fn, dict) else getattr(fn, "name", "")
                                        if name.lower() in ("bash", "execute", "run_command", "execute_command", "terminal", "cmd"):
                                            target_tool = name
                                            break
                                    else:
                                        first_t = request.tools[0]
                                        fn = first_t.get("function", {}) if isinstance(first_t, dict) else getattr(first_t, "function", None)
                                        target_tool = fn.get("name", "bash") if isinstance(fn, dict) else getattr(fn, "name", "bash")
                                fallback_tool_calls = [
                                    DeltaToolCall(
                                        index=idx,
                                        id=make_tool_call_id(),
                                        type="function",
                                        function=DeltaFunctionCall(
                                            name=target_tool,
                                            arguments=json.dumps({target_param: cmd.strip()}, ensure_ascii=False),
                                        ),
                                    )
                                    for idx, cmd in enumerate(exec_matches) if cmd.strip()
                                ]
                                if fallback_tool_calls:
                                    if delta_message is None:
                                        delta_message = DeltaMessage()
                                    delta_message.tool_calls = fallback_tool_calls
                                    delta_message.content = None
                        if tools_streamed[i] and not tool_choice_function_name:"""

if "Fallback for DSML execute in streaming" not in serving_content and target_marker in serving_content:
    serving_content = serving_content.replace(target_marker, patch_stream, 1)
    with open(target_serving, "w", encoding="utf-8") as f:
        f.write(serving_content)
    print("Patched serving.py successfully")
else:
    print("serving.py patch check:", "already patched" if "Fallback for DSML execute in streaming" in serving_content else "marker not found")
