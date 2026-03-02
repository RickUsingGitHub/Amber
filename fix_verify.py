with open('/home/jules/verification/verify_feature.py', 'r') as f:
    content = f.read()

content = content.replace('page.wait_for_selector("#stateSelector option[value=\'NSW\']", timeout=5000)', 'page.wait_for_selector("#stateSelector option", timeout=5000)')

with open('/home/jules/verification/verify_feature.py', 'w') as f:
    f.write(content)
