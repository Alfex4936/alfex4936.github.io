#!/usr/bin/env python3
"""Assert Redis 7.2.16 behavior in an opt-in, network-isolated Docker container.

Reproduce: python3 scripts/test-redis-internals.py --docker
No image pulls, host Redis connections, third-party modules, or production targets.
The time limits below bound this test; they are not Redis latency guarantees.
"""
import argparse
import json
import re
import selectors
import subprocess
import time
import uuid


IMAGE = "redis:7.2.16"


def run(*args, input=None, timeout=15):
    return subprocess.run(
        args, input=input, text=True, capture_output=True, check=True,
        timeout=timeout,
    ).stdout.strip()


def poll(label, probe, timeout=30):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = probe()
        if last:
            return last
        time.sleep(.05)
    raise AssertionError(f"Timeout waiting for {label}; last result: {last!r}")


class Lab:
    def __init__(self):
        self.name = "blog-internals-" + uuid.uuid4().hex
        self.ports = []
        self.configs = {}

    def exec(self, *args, input=None, timeout=15):
        flags = ["-i"] if input is not None else []
        return run("docker", "exec", *flags, self.name, *args,
                   input=input, timeout=timeout)

    def cli(self, port, *args, raw=False):
        output = self.exec("redis-cli", "-h", "127.0.0.1", "-p", str(port),
                           "--raw" if raw else "--json", *map(str, args))
        return output if raw else json.loads(output)

    def session(self, port, commands):
        output = self.exec(
            "redis-cli", "-h", "127.0.0.1", "-p", str(port), "--json",
            input="\n".join(commands) + "\n",
        )
        return [json.loads(line) for line in output.splitlines()]

    def info(self, port, section):
        command = ("CLUSTER", "INFO") if section == "cluster" else ("INFO", section)
        return dict(
            line.split(":", 1)
            for line in self.cli(port, *command, raw=True).splitlines()
            if line and not line.startswith("#") and ":" in line
        )

    def start(self, port, extra="", sentinel=False):
        directory = f"/data/lab/{port}"
        self.exec("mkdir", "-p", directory)
        config = (
            f"bind 127.0.0.1\nport {port}\nprotected-mode yes\n"
            f"daemonize yes\npidfile {directory}/redis.pid\n"
            f"logfile {directory}/redis.log\ndir {directory}\n"
        )
        if not sentinel:
            config += "save \"\"\nappendonly no\nrepl-diskless-sync-delay 0\n"
        config += extra
        path = directory + "/redis.conf"
        self.exec("sh", "-c", 'cat > "$1"', "sh", path, input=config)
        self.configs[port] = config
        self.ports.append(port)
        print(f"CONFIG {port}\n{config.rstrip()}", flush=True)
        self.exec("redis-server", path, *(["--sentinel"] if sentinel else []))
        poll(f"PING {port}", lambda: self.cli(port, "PING") == "PONG")

    def signal(self, port, signal):
        pid = self.exec("cat", f"/data/lab/{port}/redis.pid")
        assert pid.isdigit(), pid
        self.exec("sh", "-c", 'kill "-$1" "$2"', "sh", signal, pid)

    def evidence(self):
        for port in self.ports:
            print(f"LOG {port}", flush=True)
            text = self.exec("cat", f"/data/lab/{port}/redis.log")
            for line in text.splitlines():
                if re.search(
                    r"fail|Fail|FAIL|switch-master|sdown|odown|slave|replica|"
                    r"MASTER|REPLICA|sync|Sync|election|configEpoch", line,
                ):
                    print(line, flush=True)


def encodings(lab):
    port = 17000
    lab.start(port)
    expected = {
        "hash-max-listpack-entries": "512", "hash-max-listpack-value": "64",
        "zset-max-listpack-entries": "128", "zset-max-listpack-value": "64",
        "set-max-intset-entries": "512", "set-max-listpack-entries": "128",
        "set-max-listpack-value": "64", "list-max-listpack-size": "-2",
    }
    config = lab.cli(port, "CONFIG", "GET", *expected)
    assert config == expected, config
    print("DEFAULTS " + json.dumps(config, sort_keys=True), flush=True)
    lua = """
local function encoding(k) return redis.call('OBJECT','ENCODING',k) end
local out = {}
for i=1,512 do redis.call('HSET','h',i,'v') end
table.insert(out,encoding('h'))
redis.call('HSET','h',513,'v'); table.insert(out,encoding('h'))
for i=1,128 do redis.call('ZADD','z',i,'m'..i) end
table.insert(out,encoding('z'))
redis.call('ZADD','z',129,'m129'); table.insert(out,encoding('z'))
for i=1,512 do redis.call('SADD','ints',i) end
table.insert(out,encoding('ints'))
redis.call('SADD','ints',513); table.insert(out,encoding('ints'))
redis.call('SADD','mixed','1','x'); table.insert(out,encoding('mixed'))
for i=1,128 do redis.call('SADD','strings','x'..i) end
table.insert(out,encoding('strings'))
redis.call('SADD','strings','x129'); table.insert(out,encoding('strings'))
for _,n in ipairs({64,65}) do
  local v=string.rep('x',n)
  redis.call('HSET','hv'..n,'f',v)
  redis.call('HSET','hf'..n,v,'v')
  redis.call('ZADD','zv'..n,1,v)
  redis.call('SADD','sv'..n,v)
  for _,prefix in ipairs({'hv','hf','zv','sv'}) do
    table.insert(out,encoding(prefix..n))
  end
end
return out
"""
    actual = lab.cli(port, "EVAL", lua, 0)
    wanted = [
        "listpack", "hashtable", "listpack", "skiplist",
        "intset", "hashtable", "listpack", "listpack", "hashtable",
        *["listpack"] * 4, "hashtable", "hashtable", "skiplist", "hashtable",
    ]
    assert actual == wanted, actual
    # Same character count, different UTF-8 byte lengths: 32 two-byte characters.
    assert len(("é" * 32).encode()) == 64
    assert len(("é" * 32 + "x").encode()) == 65
    lab.cli(port, "HSET", "utf64", "f", "é" * 32)
    lab.cli(port, "HSET", "utf65", "f", "é" * 32 + "x")
    assert lab.cli(port, "OBJECT", "ENCODING", "utf64") == "listpack"
    assert lab.cli(port, "OBJECT", "ENCODING", "utf65") == "hashtable"
    print("PASS encodings: hash512/513 zset128/129 intset512/513 "
          "mixed-set/listpack128/129 value64/65 field64/65 UTF-8 bytes", flush=True)
    assert lab.cli(port, "RPUSH", "small-list", "a", "b") == 2
    assert lab.cli(port, "OBJECT", "ENCODING", "small-list") == "listpack"
    # Use an explicit element-count limit so byte overhead does not obscure
    # the half-limit hysteresis. The default -2 is separately asserted above.
    assert lab.cli(port, "CONFIG", "SET", "list-max-listpack-size", 4) == "OK"
    print("CONFIG runtime list-max-listpack-size=4 (controlled count limit)", flush=True)
    assert lab.cli(port, "RPUSH", "list-growth", "a", "b", "c", "d") == 4
    assert lab.cli(port, "OBJECT", "ENCODING", "list-growth") == "listpack"
    assert lab.cli(port, "RPUSH", "list-growth", "e") == 5
    assert lab.cli(port, "OBJECT", "ENCODING", "list-growth") == "quicklist"
    assert lab.cli(port, "RPOP", "list-growth", 2) == ["e", "d"]
    assert lab.cli(port, "OBJECT", "ENCODING", "list-growth") == "quicklist"
    assert lab.cli(port, "RPOP", "list-growth") == "c"
    assert lab.cli(port, "OBJECT", "ENCODING", "list-growth") == "listpack"
    assert lab.cli(port, "LRANGE", "list-growth", 0, -1) == ["a", "b"]
    assert lab.cli(port, "CONFIG", "SET", "list-max-listpack-size", -2) == "OK"
    print("PASS lists: default small=listpack; limit4 count4=listpack "
          "count5=quicklist; shrink3=quicklist shrink2=listpack", flush=True)


def acl_pubsub(lab):
    port = 17000
    lab.cli(port, "SET", "article:one", "readable")
    lab.cli(port, "SET", "metrics:one", "42")
    rules = ["reset", "on", "nopass", "-@all", "~article:*", "+get",
             "(~metrics:* +mget)"]
    assert lab.cli(port, "ACL", "SETUSER", "reader", *rules) == "OK"
    print("ACL reader " + " ".join(rules), flush=True)

    def reader(*args):
        return lab.exec(
            "redis-cli", "-h", "127.0.0.1", "-p", str(port),
            "--user", "reader", "-a", "", "--no-auth-warning", "--raw",
            *args,
        )

    assert reader("GET", "article:one") == "readable"
    assert reader("MGET", "metrics:one") == "42"
    for command in (
        ("GET", "metrics:one"), ("MGET", "article:one"),
        ("MGET", "metrics:one", "article:one"),
        ("GET", "private:one"), ("SET", "article:one", "bad"),
        ("EVAL", "return 1", "0"),
    ):
        error = reader(*command)
        assert error.startswith("NOPERM "), (command, error)
    assert lab.cli(port, "GET", "article:one") == "readable"
    print("PASS ACL: actual authenticated reader, selector command/key "
          "permissions do not merge; unrelated keys, writes, EVAL denied", flush=True)

    channel = "article-events"
    assert lab.cli(port, "PUBLISH", channel, "offline-before") == 0

    def subscribed_message():
        # All sockets are inside the container. Only redis-cli's stdout is
        # observed by the host, and every blocking read has a deadline.
        process = subprocess.Popen(
            ["docker", "exec", lab.name, "redis-cli", "-h", "127.0.0.1",
             "-p", str(port), "--raw", "SUBSCRIBE", channel],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0,
        )
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)

                def line():
                    assert selector.select(10), "Pub/Sub output deadline"
                    # Unbuffered byte-by-byte reads avoid a buffered stream
                    # hiding already-read lines from the selector.
                    data = bytearray()
                    while True:
                        assert selector.select(10), "Pub/Sub line deadline"
                        byte = process.stdout.read(1)
                        assert byte, "Pub/Sub process closed unexpectedly"
                        data.extend(byte)
                        if byte == b"\n":
                            return data.decode().rstrip("\r\n")

                assert [line(), line(), line()] == ["subscribe", channel, "1"]
                assert lab.cli(port, "PUBLISH", channel, "live") == 1
                assert [line(), line(), line()] == ["message", channel, "live"]
        finally:
            process.terminate()
            process.communicate(timeout=10)
            # Terminating docker exec may leave its child until the next
            # socket write. Kill just this channel's Pub/Sub client explicitly.
            lab.cli(port, "CLIENT", "KILL", "TYPE", "pubsub")
            poll("subscriber disconnected", lambda:
                 lab.cli(port, "PUBSUB", "NUMSUB", channel) == [channel, 0])

    subscribed_message()
    assert lab.cli(port, "PUBLISH", channel, "offline-between") == 0
    subscribed_message()
    print("PASS Pub/Sub: disconnected PUBLISH=0; reconnect sees subscribe "
          "then only new live message, no replay of offline messages", flush=True)


def synced(lab, primary, replica):
    poll(
        f"replica {replica} synchronized with {primary}",
        lambda: (
            lab.info(replica, "replication").get("master_link_status") == "up"
            and lab.info(replica, "replication").get("master_sync_in_progress") == "0"
            and lab.info(primary, "replication").get("connected_slaves") == "1"
        ),
    )


def replication(lab):
    primary, replica = 17100, 17101
    lab.start(primary)
    lab.start(replica, f"replicaof 127.0.0.1 {primary}\n")
    synced(lab, primary, replica)
    replies = lab.session(primary, ["SET replicated payload", "WAIT 1 5000"])
    assert replies == ["OK", 1], replies
    assert lab.cli(replica, "GET", "replicated") == "payload"
    error = lab.cli(replica, "SET", "forbidden", "write", raw=True)
    assert error.startswith("READONLY "), error
    assert lab.cli(primary, "GET", "forbidden") is None
    # No quorum or election: explicit primary-coordinated standalone handoff.
    assert lab.cli(primary, "FAILOVER", "TO", "127.0.0.1", replica) == "OK"
    poll("standalone FAILOVER roles", lambda: (
        lab.info(replica, "replication").get("role") == "master"
        and lab.info(primary, "replication").get("role") == "slave"
        and lab.info(primary, "replication").get("master_link_status") == "up"
        and lab.info(primary, "replication").get("master_port") == str(replica)
    ))
    replies = lab.session(replica, ["SET after-handoff next", "WAIT 1 5000"])
    assert replies == ["OK", 1], replies
    assert lab.cli(primary, "GET", "after-handoff") == "next"
    print("PASS replication: same-client WAIT=1, replica READONLY; "
          "standalone FAILOVER TO reverses roles and replicates new writes", flush=True)
    for port in (primary, replica):
        print(f"INFO replication {port} " +
              json.dumps(lab.info(port, "replication"), sort_keys=True), flush=True)


def sentinel(lab):
    primary, replica = 17300, 17301
    lab.start(primary)
    lab.start(replica, f"replicaof 127.0.0.1 {primary}\n")
    synced(lab, primary, replica)
    assert lab.session(primary, ["SET sentinel-proof before", "WAIT 1 5000"]) == ["OK", 1]
    sentinels = (17400, 17401, 17402)
    for port in sentinels:
        lab.start(
            port,
            f"sentinel monitor article 127.0.0.1 {primary} 2\n"
            "sentinel down-after-milliseconds article 1000\n"
            "sentinel failover-timeout article 10000\n"
            "sentinel parallel-syncs article 1\n",
            sentinel=True,
        )
    for port in sentinels:
        poll(f"Sentinel peers {port}", lambda port=port:
             len(lab.cli(port, "SENTINEL", "SENTINELS", "article")) == 2)
        poll(f"Sentinel replica {port}", lambda port=port:
             len(lab.cli(port, "SENTINEL", "REPLICAS", "article")) == 1)
        quorum = lab.cli(port, "SENTINEL", "CKQUORUM", "article", raw=True)
        assert quorum.startswith("OK 3 usable Sentinels."), quorum
        master = lab.cli(port, "SENTINEL", "MASTER", "article")
        assert master["quorum"] == "2", master
    lab.signal(primary, "KILL")
    for port in sentinels:
        poll(f"Sentinel switch-master {port}", lambda port=port:
             lab.cli(port, "SENTINEL", "GET-MASTER-ADDR-BY-NAME", "article")
             == ["127.0.0.1", str(replica)], timeout=45)
    assert lab.info(replica, "replication")["role"] == "master"
    assert lab.cli(replica, "GET", "sentinel-proof") == "before"
    assert lab.cli(replica, "SET", "sentinel-proof", "after") == "OK"
    logs = "\n".join(lab.exec("cat", f"/data/lab/{p}/redis.log") for p in sentinels)
    for event in ("+sdown", "+odown", "+elected-leader",
                  "+promoted-slave", "+switch-master"):
        assert event in logs, event
    print("PASS Sentinel: 3 Sentinels, quorum=2, CKQUORUM=3; "
          "killed primary, elected leader, promoted replica, all observers switched",
          flush=True)
    print("INFO Sentinel " + lab.cli(sentinels[0], "INFO", "sentinel", raw=True),
          flush=True)


def migration(lab):
    source, target = 17200, 17201
    lab.start(source)
    lab.start(target)
    assert lab.cli(source, "SET", "move", "payload") == "OK"
    assert lab.cli(source, "MIGRATE", "127.0.0.1", target, "move", 0, 2000) == "OK"
    assert lab.cli(source, "EXISTS", "move") == 0
    assert lab.cli(target, "GET", "move") == "payload"
    lab.cli(source, "SET", "collision", "source-value")
    lab.cli(target, "SET", "collision", "target-value")
    error = lab.cli(source, "MIGRATE", "127.0.0.1", target, "collision",
                    0, 2000, raw=True)
    assert "Target instance replied with error: BUSYKEY" in error, error
    assert lab.cli(source, "GET", "collision") == "source-value"
    assert lab.cli(target, "GET", "collision") == "target-value"
    print("PASS MIGRATE: success deletes source; actual RESTORE BUSYKEY "
          "keeps source and target values", flush=True)
    print("GAP MIGRATE lost-RESTORE-ACK: not exercised. Container networking "
          "is disabled and no Python proxy is installed inside the image. "
          "BUSYKEY is a real target error, not an ACK-loss reproduction.", flush=True)


def nodes(lab, port):
    result = {}
    for line in lab.cli(port, "CLUSTER", "NODES", raw=True).splitlines():
        fields = line.split()
        result[fields[0]] = {
            "address": fields[1], "flags": fields[2].split(","),
            "master": fields[3], "link": fields[7],
        }
    return result


def cluster(lab):
    ports = list(range(17500, 17506))
    for port in ports:
        lab.start(
            port, "cluster-enabled yes\ncluster-config-file nodes.conf\n"
            "cluster-node-timeout 2000\n"
            f"cluster-announce-ip 127.0.0.1\ncluster-announce-port {port}\n"
            f"cluster-announce-bus-port {port + 10000}\n",
        )
    output = lab.exec(
        "redis-cli", "--cluster", "create",
        *(f"127.0.0.1:{p}" for p in ports),
        "--cluster-replicas", "1", "--cluster-yes", timeout=45,
    )
    assert "[OK] All 16384 slots covered." in output, output
    ids = {p: lab.cli(p, "CLUSTER", "MYID") for p in ports}
    for port in ports:
        poll(f"cluster_state:ok {port}", lambda port=port:
             lab.info(port, "cluster").get("cluster_state") == "ok")
    topology = nodes(lab, ports[0])
    masters = [p for p in ports if "master" in topology[ids[p]]["flags"]]
    replicas = [p for p in ports if "slave" in topology[ids[p]]["flags"]]
    assert len(masters) == len(replicas) == 3, topology
    for port in replicas:
        poll(f"cluster replication {port}", lambda port=port:
             lab.info(port, "replication").get("master_link_status") == "up"
             and lab.info(port, "replication").get("master_sync_in_progress") == "0")
    print("TOPOLOGY " + json.dumps(topology, sort_keys=True), flush=True)

    existing, missing = "{route}:existing", "{route}:missing"
    slot = lab.cli(ports[0], "CLUSTER", "KEYSLOT", existing)
    assert lab.cli(ports[0], "CLUSTER", "KEYSLOT", missing) == slot
    ranges = lab.cli(ports[0], "CLUSTER", "SLOTS")
    owner = next(item[2][1] for item in ranges if item[0] <= slot <= item[1])
    target = next(p for p in masters if p != owner)
    assert lab.cli(owner, "SET", existing, "original") == "OK"
    assert lab.cli(target, "CLUSTER", "SETSLOT", slot, "IMPORTING", ids[owner]) == "OK"
    assert lab.cli(owner, "CLUSTER", "SETSLOT", slot, "MIGRATING", ids[target]) == "OK"
    assert lab.cli(owner, "GET", existing) == "original"
    ask = lab.cli(owner, "GET", missing, raw=True)
    moved = lab.cli(target, "GET", existing, raw=True)
    retry = lab.cli(owner, "MGET", existing, missing, raw=True)
    assert ask == f"ASK {slot} 127.0.0.1:{target}", ask
    assert moved == f"MOVED {slot} 127.0.0.1:{owner}", moved
    assert retry.startswith("TRYAGAIN "), retry
    assert lab.session(target, ["ASKING", f"GET {missing}"]) == ["OK", None]
    assert lab.cli(owner, "MIGRATE", "127.0.0.1", target, existing, 0, 2000) == "OK"
    assert lab.cli(owner, "GET", existing, raw=True) == ask
    assert lab.session(target, ["ASKING", f"GET {existing}"]) == ["OK", "original"]
    for port in masters:
        assert lab.cli(port, "CLUSTER", "SETSLOT", slot, "NODE", ids[target]) == "OK"
    for port in ports:
        poll(f"slot owner convergence {port}", lambda port=port:
             lab.cli(port, "GET", existing, raw=True) == (
                 "original" if port == target else f"MOVED {slot} 127.0.0.1:{target}"
             ))
    print(f"PASS Cluster routes: existing=local missing={ask}; target={moved}; "
          f"mixed MGET={retry}; ASKING+GET works; MIGRATE then final MOVED",
          flush=True)

    failed, observer, paused = masters
    replacement = next(p for p in replicas
                       if topology[ids[p]]["master"] == ids[failed])
    # One voter alone cannot establish FAIL: keep PFAIL observable before
    # resuming the second surviving voter to reach a majority of three.
    lab.signal(failed, "STOP")
    lab.signal(paused, "STOP")
    try:
        pfail = poll("isolated voter observes PFAIL", lambda:
                     nodes(lab, observer)[ids[failed]]
                     if "fail?" in nodes(lab, observer)[ids[failed]]["flags"]
                     else None, timeout=20)
        print("PFAIL evidence " + json.dumps(pfail, sort_keys=True), flush=True)
    finally:
        lab.signal(paused, "CONT")
    fail = poll("majority establishes FAIL", lambda:
                nodes(lab, observer)[ids[failed]]
                if "fail" in nodes(lab, observer)[ids[failed]]["flags"]
                else None, timeout=30)
    print("FAIL evidence " + json.dumps(fail, sort_keys=True), flush=True)
    poll("automatic replica promotion", lambda:
         "master" in nodes(lab, observer)[ids[replacement]]["flags"]
         and lab.info(replacement, "replication").get("role") == "master",
         timeout=40)
    for port in (observer, paused, replacement):
        poll(f"cluster recovers {port}", lambda port=port:
             lab.info(port, "cluster").get("cluster_state") == "ok")
    final = nodes(lab, observer)
    assert "fail" in final[ids[failed]]["flags"], final
    slots = lab.cli(observer, "CLUSTER", "SLOTS")
    assert any(item[2][1] == replacement for item in slots), slots
    log = lab.exec("cat", f"/data/lab/{replacement}/redis.log")
    assert "Failover election won" in log, log
    print("PASS Cluster failure: 3 voting masters+3 replicas; PFAIL without "
          "majority, FAIL after second voter resumes, automatic replacement "
          f"{failed}->{replacement}, cluster_state=ok", flush=True)
    print("FINAL TOPOLOGY " + json.dumps(final, sort_keys=True), flush=True)
    print("INFO Cluster " +
          json.dumps(lab.info(observer, "cluster"), sort_keys=True), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docker", action="store_true",
                        help="opt in to creating one private Redis container")
    args = parser.parse_args()
    if not args.docker:
        parser.error("--docker is required; this script never connects to host Redis")
    image = run("docker", "image", "inspect", IMAGE, "--format", "{{.Id}}")
    lab = Lab()
    created = False
    try:
        run(
            "docker", "run", "--pull=never", "--rm", "-d", "--network=none",
            "--name", lab.name, "--entrypoint", "sh", IMAGE,
            "-c", "exec sleep infinity",
        )
        created = True
        version = lab.exec("redis-server", "--version")
        assert re.search(r"\bv=7\.2\.16\b", version), version
        print(f"VERSION {version}\nIMAGE {image}\n"
              "ISOLATION network=none; loopback only; no published ports; "
              "one unique disposable container", flush=True)
        try:
            encodings(lab)
            acl_pubsub(lab)
            replication(lab)
            sentinel(lab)
            migration(lab)
            cluster(lab)
        finally:
            lab.evidence()
        print("ALL ASSERTIONS PASSED (ACK-loss gap explicitly excluded)", flush=True)
    finally:
        if created:
            run("docker", "rm", "-f", lab.name)
            print("CLEANUP private container removed", flush=True)


if __name__ == "__main__":
    main()
